/* Setting things up. */
var path = require("path"),
  express = require("express"),
  app = express();
var helpers = require(__dirname + "/helpers.js"),
  twitter = require(__dirname + "/twitter.js"),
  res = null;
var fs = require("fs");
const request = require("request");
const GIFEncoder = require("gifencoder");
const { createCanvas, loadImage } = require("canvas");
const bsplit = require("buffer-split");
var JPEGDecoder = require("jpg-stream/decoder");

app.use(express.static("public"));
/* Setting things up. */
var path = require("path"),
  express = require("express"),
  app = express();
var helpers = require(__dirname + "/helpers.js"),
  twitter = require(__dirname + "/twitter.js"),
  res = null;

app.use(express.static("public"));

/* You can use uptimerobot.com or a similar site to hit your /BOT_ENDPOINT to wake up your app and make your Twitter bot tweet. */
function getPic(url) {
  const picUrl = url;
  request.post(
    "https://pgewam.lovelytics.info/pge_weather_app/pic3.php",
    { form: { uri: picUrl } },
    function optionalCallback(err, httpResponse, body) {
      if (err) {
        return console.error("upload failed:", err);
      } else if (httpResponse) {
        console.log("got image " + picUrl);
        let imgSRC = "data:image/png;base64," + JSON.parse(body)["data4"];
        return "data:image/png;base64," + JSON.parse(body)["data4"];
      }
    }
  );
}

function getRandomCamera(callback) {
  request.get(
    {
      url:
        "http://s3-us-west-2.amazonaws.com/alertwildfire-data-public/all_cameras.json",
      headers: {
        Origin: "http://www.alertwildfire.org",
        Host: "s3-us-west-2.amazonaws.com",
        Referer: "http://www.alertwildfire.org/"
      }
    },
    (err, fileContents) => {
      if (err) {
        console.error(err);
        return;
      }

      const data = JSON.parse(fileContents.body);
      const site = helpers.randomFromArray(data.features);
      const id = site.properties.id;
      const url =
        "https://data.alertwildfire.org/api/firecams/v0/currentimage?name=" +
        id;

      const name = site.properties.name;
      const alt = site.geometry.coordinates[2] * 1000 * 3.28084;
      const lat = (+site.geometry.coordinates[1]).toFixed(4);
      const long = (+site.geometry.coordinates[0]).toFixed(4);

      const county = site.properties.county;
      const state = site.properties.state;

      callback({ name, id, url, alt, lat, long, county, state });
    }
  );
}
/* You can use uptimerobot.com or a similar site to hit your /BOT_ENDPOINT to wake up your app and make your Twitter bot tweet. */

app.all(`/${process.env.BOT_ENDPOINT}`, function(req, res) {
  getRandomCamera(({ name, county, state, lat, long, alt, url }) => {
    request.post(
      "https://pgewam.lovelytics.info/pge_weather_app/pic3.php",
      { form: { uri: url } },
      function optionalCallback(err, httpResponse, body) {
        if (err) {
          return console.error("upload failed:", err);
        } else if (httpResponse) {
          let imgSRC = JSON.parse(body)["data4"];

          twitter.postImage(
            generateTweetText({ name, county, state, lat, long, alt }),
            imgSRC,
            function(err, data) {
              if (err) {
                console.log(err);
                res.sendStatus(500);
              } else {
                res.sendStatus(200);
              }
            }
          );
        }
      }
    );
    return getPic(url);
  });
});

app.all(`/${process.env.GIF_ENDPOINT}`, (req, res) => {
  getRandomCamera(({ id, name, county, state, lat, long, alt, url }) => {
    const length = helpers.randomFromArray(["15m", "1h", "3h", "6h", "12h"]);
    const frames =
      "http://ts1.alertwildfire.org/cameras/" +
      id +
      "/images:timelapse?preset=" +
      length +
      "&nocache=" +
      Date.now();

    request.get(
      {
        url: frames,
        encoding: null,
        headers: {
          Accept:
            "image/png,image/svg+xml,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.1 Safari/605.1.15",
          Referer:
            "http://www.alertwildfire.org/tahoe/index.html?camera=" +
            id +
            "&v=518dd6a"
        }
      },
      (err, fileContents) => {
        if (err) {
          console.error(err);
        }

        let frames = bsplit(
          fileContents.body,
          new Buffer("--frame\r\nContent-Type: image/jpeg\r\n\r\n"),
          true
        ).slice(1);

        writeGif(frames, () => {
          const imgSRC = fs.readFileSync("./tmp.gif", {
            encoding: null
          });

          twitter.postImage(
            generateTweetText({ name, county, state, lat, long, alt }),
            imgSRC.toString("base64"),
            function(err, data) {
              if (err) {
                console.log(err);
                res.sendStatus(500);
              } else {
                res.sendStatus(200);
              }
            }
          );
        });
      }
    );
  });
});

var listener = app.listen(process.env.PORT, function() {
  console.log("your bot is running on port " + listener.address().port);
});

async function writeGif(frames, callback) {
  if (!fs.existsSync("frames")) {
    fs.mkdirSync("frames");
  }

  const encoder = new GIFEncoder(480, 270);

  let stream = encoder.createReadStream().pipe(fs.createWriteStream("tmp.gif"));

  encoder.setRepeat(0); // 0 for repeat, -1 for no-repeat
  encoder.setDelay(67); // frame delay in ms
  encoder.setQuality(100); // image quality. 10 is default. Higher is lower quality.
  encoder.start();

  let maxFrames = 60;
  let skip = Math.ceil(frames.length / maxFrames);
  let start = 0;

  let mode = helpers.randomFromArray(["smooth", "all"]);

  if (mode === "smooth") {
    skip = 1;
    start = frames.length - maxFrames;
  }

  console.log("Generating GIF with mode " + mode);

  // use node-canvas
  const canvas = createCanvas(480, 270);
  const ctx = canvas.getContext("2d");

  for (let i = start; i < frames.length; i++) {
    let frame = frames[i];

    if (i % skip === 0) {
      fs.writeFileSync(
        "frames/" + i + ".jpg",
        frame.slice(0, frame.length - 2)
      );

      try {
        let image = await loadImage("frames/" + i + ".jpg");
        ctx.drawImage(image, 0, 0, 480, 270);
        encoder.addFrame(ctx);
      } catch (e) {
        console.log(e);
      }

      fs.unlinkSync("frames/" + i + ".jpg");
    }
  }

  encoder.finish();

  stream.on("finish", function() {
    console.log("finished GIF");
    callback();
  });
}

function generateTweetText({ name, county, state, lat, long, alt }) {
  return (
    name +
    "\n" +
    county +
    " County, " +
    state +
    "\n" +
    Math.round(alt) +
    " ft (" +
    lat +
    ", " +
    long +
    ")"
  );
}
