const { prompt, registerPrompt } = require("inquirer");
const mustache = require("mustache");
const fs = require("fs");
const { promisify } = require("util");
const slugify = require("slugify");
const request = require("request-promise-native");
const qs = require("querystring");
const { DateTime } = require("luxon");

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

registerPrompt("datetime", require("inquirer-datepicker-prompt"));

const isNotEmpty = input => input.length > 0;

const questions = [
  {
    type: "input",
    name: "version",
    message: "API Hour version",
    filter: input => parseInt(input, 10),
    validate: input => Number.isInteger(input)
  },
  {
    type: "input",
    name: "location",
    message: "location name",
    validate: isNotEmpty
  },
  {
    type: "input",
    name: "address",
    message: "location address",
    validate: isNotEmpty
  },
  {
    type: "datetime",
    name: "date",
    message: "API Hour date",
    format: ["d", "/", "m", "/", "yy"]
  },
  {
    type: "datetime",
    name: "eventbrite_date",
    message: "when eventbrite reservation will be open?",
    format: ["d", "/", "m", "/", "yy"]
  }
];

const talkQuestion = [
  {
    type: "input",
    name: "speaker",
    message: "speaker name",
    validate: isNotEmpty
  },
  {
    type: "input",
    name: "title",
    message: "talk title",
    validate: isNotEmpty
  },
  {
    type: "editor",
    name: "description",
    message: "talk description",
    validate: isNotEmpty
  },
  {
    type: "confirm",
    name: "longTalk",
    message: "is this a 30 min talk ?",
    default: false
  },
  {
    type: "confirm",
    name: "newTalk",
    message: "add a new talk ?"
  }
];

const apiHour = async () => {
  const answers = await prompt(questions);
  const talkAnswers = [];

  let newTalk = false;
  let longTalk = false;
  const today = DateTime.local();
  today.setLocale("fr");
  const printedDate = today.toFormat("yyyy-LL-dd");

  const ApiHourDate = DateTime.fromJSDate(answers.date);
  const eventbriteDate = DateTime.fromJSDate(answers.eventbrite_date);

  do {
    const talkAnswer = await prompt(talkQuestion);
    newTalk = talkAnswer.newTalk;
    if (talkAnswer.longTalk === true) {
      longTalk = true;
    }
    talkAnswers.push({
      slug:
        printedDate +
        "-" +
        slugify(talkAnswer.speaker) +
        "-" +
        slugify(talkAnswer.title),
      ...talkAnswer
    });
  } while (newTalk === true);

  let apiHourContent = "";
  let talkContent = "";

  try {
    apiHourContent = await readFile(
      __dirname + "/../templates/apiHour.md.tpl",
      "utf-8"
    );
  } catch (e) {
    console.log("impossible to open api hour template");
    process.exit(1);
  }

  try {
    talkContent = await readFile(
      __dirname + "/../templates/talk.md.tpl",
      "utf-8"
    );
    mustache.parse(talkContent);
  } catch (e) {
    console.log("impossible to open talk template");
    process.exit(1);
  }

  let osm = "";
  try {
    let apiHourOSM = await request.get({
      uri: "https://nominatim.openstreetmap.org/search",
      qs: {
        q: answers.address,
        format: "json",
        email: "hello@clermontech.org"
      }
    });

    apiHourOSM = JSON.parse(apiHourOSM);
    const bb = apiHourOSM[0].boundingbox.sort((a, b) => {
      return Number(a) - Number(b);
    });

    osm = qs.stringify({
      bbox: bb[0] + "," + bb[2] + "," + bb[1] + "," + bb[3],
      layer: "mapnik",
      marker: apiHourOSM[0].lat + "," + apiHourOSM[0].lon
    });
  } catch (e) {
    console.log("impossible to fetch opendata position for this address");
  }

  const apiHour = mustache.render(apiHourContent, {
    apiHour: {
      ...answers,
      date: ApiHourDate.setLocale("fr").toFormat("dd LLLL yyyy"),
      eventbrite_date: eventbriteDate.setLocale("fr").toFormat("dd LLLL yyyy")
    },
    talks: talkAnswers,
    longTalk,
    osmQs: osm
  });

  await writeFile(
    __dirname +
      "/../../_posts/" +
      printedDate +
      "-api-hour-" +
      answers.version +
      ".md",
    apiHour
  );

  talkAnswers.forEach(async talk => {
    const content = mustache.render(talkContent, {
      ...talk,
      version: answers.version
    });

    await writeFile(__dirname + "/../../_posts/" + talk.slug + ".md", content);
  });
};

module.exports = apiHour;
