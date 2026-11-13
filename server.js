const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function requireSupabase(res) {
  if (supabase) return true;
  res.status(500).json({ error: "Supabase is not configured." });
  return false;
}

function duplicateUrl(error) {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = String(error.message || "").toLowerCase();
  return message.includes("duplicate") && message.includes("url");
}

function asText(value, limit) {
  if (value == null) return "";
  return String(value).trim().slice(0, limit);
}

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (match, digits) => {
      const code = Number(digits);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
}

function stripHtml(value, limit) {
  let text = String(value == null ? "" : value);
  for (let pass = 0; pass < 2; pass += 1) {
    text = text.replace(/<[^>]*>/g, " ");
    text = decodeEntities(text);
  }
  text = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, limit);
}

function sameText(left, right) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function splitPublisher(title) {
  const index = title.lastIndexOf(" - ");
  if (index <= 0) return { title: title.slice(0, 300), source: "" };
  const headline = title.slice(0, index).trim();
  const source = title.slice(index + 3).trim();
  if (!headline || !source || source.length > 80) return { title: title.slice(0, 300), source: "" };
  return { title: headline.slice(0, 300), source: source.slice(0, 80) };
}

function preparePost(body, receivedAt) {
  const fullTitle = stripHtml(body.title, 500);
  const split = splitPublisher(fullTitle);
  let text = stripHtml(body.text, 5000);
  const titled = split.source ? split.title + " - " + split.source : split.title;
  if (!text || sameText(text, fullTitle) || sameText(text, split.title) || sameText(text, titled)) {
    text = "";
  }
  const source = stripHtml(body.source, 80) || split.source;
  return {
    title: split.title,
    text,
    source,
    image: asHttpUrl(body.image),
    url: asHttpUrl(body.url),
    receivedAt: receivedAt || new Date().toISOString(),
  };
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

app.post("/api/webhook", async (req, res) => {
  if (!requireSupabase(res)) return;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const post = preparePost(body);

  if (!post.title && !post.text && !post.url) {
    res.status(400).json({ error: "Send a title, text, or url." });
    return;
  }

  const { error } = await supabase.from("elephant_news").insert({
    title: post.title,
    source: post.source,
    text: post.text,
    url: post.url,
    image: post.image,
  });

  if (duplicateUrl(error)) {
    res.json({ ok: true, duplicate: true });
    return;
  }
  if (error) {
    console.error("Could not save story:", error.message);
    res.status(500).json({ error: "Could not save the story." });
    return;
  }
  res.status(201).json({ ok: true });
});

app.get("/api/news", async (req, res) => {
  if (!requireSupabase(res)) return;
  const { data, error } = await supabase
    .from("elephant_news")
    .select("*")
    .order("date", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Could not load stories:", error.message);
    res.status(500).json({ error: "Could not load the stories." });
    return;
  }

  res.json((data || []).map((row) => ({
    ...row,
    receivedAt: row.receivedAt || row.date || null,
  })));
});

app.listen(PORT, () => {
  console.log("Sri Lanka elephant news tracker listening on " + PORT);
});
