const recuperationItemsFromFiles = require("./src/recuperation_items");
const {retrive_market_data, get_server_data} = require("./src/requete_market");
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

function getItemNameFromIds(id_list) {
    const to_return = {};
    id_list.split(',').forEach(item_id => {
        to_return[item_id] = ff14_items[item_id];
    })
    return to_return;
}


init();

app.get('/', (req, res) => {
    res.render('index', {data: ff14_items});
});

app.get('/marketDetail', async (req, res) => {
    const ids_param = req.query["ids"];
    const items_mapping = getItemNameFromIds(ids_param);
    const json_data = await retrive_market_data(ids_param);
    const server_data = get_server_data();
    console.log(server_data);
    console.log('item mapping');
    console.log(items_mapping);
    res.render('marketDetail', {data: json_data, server_data: server_data, items_mapping: items_mapping});
    //res.json(json_data);
});


app.listen(port, () => {
    console.log(`Serveur démarré sur http://localhost:${port}`);
});