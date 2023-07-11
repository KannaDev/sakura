const express = require("express");
const cors = require("cors");
const chalk = require("chalk");
const cheerio = require("cheerio");
const axios = require("axios");
const UserAgent = require("user-agents");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");

console.clear();

const port = 3001;

const app = express();

app.set("view engine", "ejs");

app.use(cors());
app.use(express.static("public"));

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

const log = (info) => console.log(chalk.hex(`#f8c8dc`)(`[❀ » sakura] ${info}`));

app.get("/", async (req, res) => {
  res.render(`index`);
});

app.get("/dl/:appid", async (req, res) => {
  const steamAPIResponse = await client.get(
    `https://store.steampowered.com/api/appdetails?appids=${req.params.appid}&lang=en-us`
  );

  const steamApp = steamAPIResponse.data[req.params.appid];

  if (steamApp.success) {
    res.render(`app`, { app: steamApp });
  } else {
    res.render(`index`);
  }
});

app.get("/app/:appid", async (req, res) => {
  var hasResponse = false;

  const steamAPIResponse = await client.get(
    `https://store.steampowered.com/api/appdetails?appids=${req.params.appid}&lang=en-us`
  );

  const steamApp = steamAPIResponse.data[req.params.appid];

  log(
    `steam game requested: ${req.params.appid} (${
      steamApp.success ? steamApp.data.name : `no candidate found`
    })`
  );

  if (steamApp.success) {
    const steamUnlockedResponse = await client.get(
      `https://steamunlocked.net/?s=${steamApp.data.name}`
    );
    const $ = cheerio.load(steamUnlockedResponse.data);

    const results = $(".cover-items .cover-item");
    const matches = [];

    for (let i = 0; i < results.length; i++) {
      const element = $(results[i]);
      const container = $(element.find(".cover-item-title")[0]);

      const link = $(container.find("a")[0]);
      const attributes = link.attr();

      const title = $(link.find("h1")[0]);
      const name = title.text();

      matches.push({ name, href: attributes.href });
    }

    const match = matches.find((match) =>
      match.name.includes(steamApp.data.name)
    );

    if (match) {
      log(`found result on SteamUnlocked: ${match.name}`);

      const newSteamUnlockedResponse = await axios.get(match.href);
      const _$ = cheerio.load(newSteamUnlockedResponse.data);

      const matchingElements = _$(".btn-download");
      const downloadButton = _$(matchingElements[0]);

      const buttonAttributes = downloadButton.attr();

      const uploadHavenResponse = await client.get(buttonAttributes.href, {
        headers: {
          "User-Agent": new UserAgent().toString(),
          Referer: match.href,
        },
      });

      const __$ = cheerio.load(uploadHavenResponse.data);

      const downloadForm = __$(".downloadForm");
      const formElements = downloadForm.find("input[type=hidden]");

      log(
        `fetched xref data from UploadHaven: ${[
          ...Array.from(formElements).map((element) => __$(element).attr()),
          { name: "type", type: "hidden", value: "premium" },
        ]
          .map((attributes) => JSON.stringify(attributes, null, 2))
          .join(`, `)}`
      );

      await new Promise((r) => setTimeout(r, 5000));

      const uploadHavenDownloadResponse = await client.post(
        buttonAttributes.href,
        [
          ...Array.from(formElements).map((element) => __$(element).attr()),
          { name: "type", type: "hidden", value: "premium" },
        ]
          .map((attributes) => {
            const { name, value } = attributes;
            return `${name}=${value}`;
          })
          .join(`&`),
        {
          headers: {
            "User-Agent": new UserAgent().toString(),
            Referer: match.href,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const ___$ = cheerio.load(uploadHavenDownloadResponse.data);

      const downloadAlert = ___$(".alert-success");
      const downloadLink = ___$(downloadAlert.find("a")[0]);

      const downloadAttributes = downloadLink.attr();

      hasResponse = true;

      res.redirect(downloadAttributes.href);
    }
  }

  if (!hasResponse) res.sendStatus(204);

  console.log();
});

app.get(`*`, async (req, res) => {
  res.render(`index`);
});

app.listen(port, () => log(`listening on port ${port}\n`));
