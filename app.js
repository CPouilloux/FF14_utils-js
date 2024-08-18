const recuperationItemsFromFiles = require("./src/recuperation_items");
const retrive_market_data = require("./src/requete_market");
const express = require('express');
const app = express();
const port = 3000;

app.use(express.static('public'));
app.set('view engine', 'ejs');

let ff14_items;


async function init() {
    if (!ff14_items) {
        ff14_items = await recuperationItemsFromFiles();
    }
}

init();

app.get('/', (req, res) => {
    res.render('index', {data: ff14_items});
});

app.get('/marketDetail', async (req, res) => {
    const ids_param = req.query["ids"];
    const json_data = await retrive_market_data(ids_param);
    console.log(ids_param);
    res.json(json_data);
});


app.listen(port, () => {
    console.log(`Serveur démarré sur http://localhost:${port}`);
});