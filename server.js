const express = require("express");
const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Chargement du Pokédex ---
const POKEDEX_PATH = path.join(__dirname, "pokedex_gen1_to_4.txt");
const pokedex = {};
fs.readFileSync(POKEDEX_PATH, "utf-8").split("\n").forEach(line => {
  if (line.includes(",")) {
    const [name, num] = line.trim().split(",");
    pokedex[name.toLowerCase()] = num.padStart(4, "0"); // 4 chiffres
  }
});

console.log("Pokédex chargé avec", Object.keys(pokedex).length, "Pokémons.");

// --- Route scan GTS ---
app.post("/scan", async (req, res) => {
  const keywords = req.body.keywords?.map(k => k.toLowerCase()) || [];
  if (keywords.length === 0) return res.json({ results: [] });

  console.log("Scan lancé pour :", keywords.join(", "));

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto("https://pkmnclassic.net/gts/", { waitUntil: "networkidle2" });
    console.log("Page GTS chargée.");

    await page.click("#cpMain_rbGen4");
    await page.click("#cpMain_btnSearch");

    await new Promise(resolve => setTimeout(resolve, 3000)); // wait

    // Extraction des tableaux
    const tables = await page.$$eval("table.gtsPokemonSummary", tables =>
      tables.map(table => {
        const detail = {};

        const rows = table.querySelectorAll("tr.pfFormPair");
        rows.forEach(row => {
          const ths = row.querySelectorAll("th.pfFormKey");
          const tds = row.querySelectorAll("td.pfFormValue");
          ths.forEach((th, i) => {
            const key = th.innerText.trim();
            const valEl = tds[i];
            if (valEl) {
              let val = valEl.textContent.trim().replace(/\n/g, " ");
              detail[key] = val;
            }
          });
        });

        return detail;
      })
    );

    console.log("Tables GTS trouvées :", tables.length);

    // Filtrer par mots-clés et ajouter numéros pour sprites
    const results = tables
      .filter(p => p.Species && keywords.some(k => p.Species.toLowerCase().startsWith(k)))
      .map(p => {
        const speciesNum = p.Species ? (p.Species.match(/\(#(\d+)\)/)?.[1] || null) : null;
        const wantedNum = p.Wanted ? (p.Wanted.match(/\(#(\d+)\)/)?.[1] || null) : null;

        console.log("Pokémon filtré :", p.Wanted, "➔", p.Species);

        return {
          ...p,
          speciesNum: speciesNum ? speciesNum.padStart(4, "0") : null,
          wantedNum: wantedNum ? wantedNum.padStart(4, "0") : null
        };
      });

    console.log("Pokémons envoyés au client :", results.length);

    res.json({ results });

  } catch (err) {
    console.error("Erreur pendant le scan :", err);
    res.status(500).json({ error: err.message });
  } finally {
    await browser.close();
    console.log("Browser fermé.");
  }
});

// --- Route sprites ---
const SPRITES_PATH = path.join(__dirname, "sprites_gen1_to_4"); 
app.get("/sprite/:dexNum", (req, res) => {
  const num = req.params.dexNum.padStart(4, "0");
  const filePath = path.join(SPRITES_PATH, `${num}.png`);
  if (fs.existsSync(filePath)) {
    console.log("Sprite trouvé pour :", num);
    res.sendFile(filePath);
  } else {
    console.log("Sprite non trouvé pour :", num);
    res.status(404).send("Sprite non trouvé");
  }
});

app.listen(PORT, () => console.log(`Serveur démarré sur http://localhost:${PORT}`));
