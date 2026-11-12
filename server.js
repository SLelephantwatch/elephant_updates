const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const NEWS_PATH = path.join(__dirname, "news.json");
const MAX_POSTS = 50;

app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function readNews() {
  try {
    const data = JSON.parse(fs.readFileSync(NEWS_PATH, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Could not read news.json:", error.message);
    }
    return [];
  }
}

function writeNews(posts) {
  const temporary = NEWS_PATH + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(posts, null, 2));
  fs.renameSync(temporary, NEWS_PATH);
}

function asText(value, limit) {
  if (value == null) return "";
  return String(value).trim().slice(0, limit);
}

function asHttpUrl(value) {
  const text = asText(value, 2000);
  if (!text) return "";
  try {
    const parsed = new URL(text);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch (error) {
    return "";
  }
  return "";
}

app.post("/api/webhook", (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const post = {
    title: asText(body.title, 300),
    text: asText(body.text, 5000),
    image: asHttpUrl(body.image),
    url: asHttpUrl(body.url),
    receivedAt: new Date().toISOString(),
  };

  if (!post.title && !post.text && !post.url) {
    res.status(400).json({ error: "Send a title, text, or url." });
    return;
  }

  const posts = [post, ...readNews()].slice(0, MAX_POSTS);
  writeNews(posts);
  res.status(201).json({ ok: true, count: posts.length });
});

app.get("/api/news", (req, res) => {
  res.json(readNews());
});

app.listen(PORT, () => {
  console.log("Sri Lanka elephant news tracker listening on " + PORT);
});
