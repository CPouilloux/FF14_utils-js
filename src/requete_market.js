const main_server = "71";
const datacenter_name = "chaos";
const chaos_servers = {
    "39": "Omega",
    "71": "Moogle",
    "80": "Cerberus",
    "83": "Louisoix",
    "85": "Spriggan",
    "97": "Ragnarok",
    "400": "Sagittarius",
    "401": "Phantom"
}

function buildUrl(list_ids) {
    //let url = "https://universalis.app/api/v2/chaos/8,9?entries=20";
    let url = `https://universalis.app/api/v2/${datacenter_name}/${list_ids}`;
    console.log(url);
    return url;
}


async function fetchJson(url) {
    try {
        const response = await fetch(url); // Faire la requête HTTP
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json(); // Convertir la réponse en JSON
        return data;
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error; // Propager l'erreur pour que l'appelant puisse la gérer
    }
}

async function getDictDataFromUrl(url) {
    try {
        const data = await fetchJson(url); // Attendre la résolution de la promesse
        return data; // Retourner les données
    } catch (error) {
        console.error('Error:', error);
        throw error; // Propager l'erreur pour la gestion en amont
    }
}

/*
{
          "lastReviewTime": 1723932301,
          "pricePerUnit": 62,
          "quantity": 2000,
          "stainID": 0,
          "worldName": "Cerberus",
          "worldID": 80,
          "creatorName": "",
          "creatorID": null,
          "hq": false,
          "isCrafted": false,
          "listingID": "9229001537159201622",
          "materia": [],
          "onMannequin": false,
          "retainerCity": 1,
          "retainerID": "33777197237671405",
          "retainerName": "Choco-berry",
          "sellerID": null,
          "total": 124000,
          "tax": 6200
        },
 */


function convertTimestampToReadableDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}


function addToListInDict(dict_to_add_in, dict_key, to_add, dont_create_list) {
    if (dict_to_add_in[dict_key]) {
        dict_to_add_in[dict_key].push(to_add);
    } else {
        dict_to_add_in[dict_key] = dont_create_list ? to_add : [to_add];
    }
}

const usefull_listing_property = ["pricePerUnit", "quantity", "worldID", "hq", "total"];

function sortMarketDataByServer(data) {
    const list_id = data["itemIDs"];
    const items = data["items"];
    let tmp = 0;
    const full_data = {};
    list_id.forEach(item_id => {
        if (!items[item_id] || !items[item_id]["listings"]){
            return;
        }
        const item_listings = items[item_id]["listings"];
        const server_listing_detail = {};
        item_listings.forEach(listing => {
            const listing_detail = {};
            usefull_listing_property.forEach(property => {
                listing_detail[property] = listing[property];
            });
            listing_detail["lastReviewTime"] = convertTimestampToReadableDate(listing["lastReviewTime"]);
            listing_detail["lastReviewTimeUnix"] = listing["lastReviewTime"];
            tmp++;
            addToListInDict(server_listing_detail, listing_detail["worldID"], listing_detail);
        });
        addToListInDict(full_data, item_id, server_listing_detail, true);

    });
    return full_data;
}

// Exemple d'utilisation


async function retrive_market_data(id_list) {
    const url = buildUrl(id_list);
    let data = await getDictDataFromUrl(url);

    // Universalis retourne un format différent selon le nombre d'items :
    // - 1 item  : { itemID: 123, listings: [...], ... }
    // - N items : { itemIDs: [123, 456], items: { 123: {...}, 456: {...} } }
    // On normalise vers le format multi-items pour que sortMarketDataByServer fonctionne toujours.
    if (data["itemID"] !== undefined && data["itemIDs"] === undefined) {
        data = {
            itemIDs: [data["itemID"]],
            items: { [data["itemID"]]: data }
        };
    }

    let full_data = sortMarketDataByServer(data);
    return full_data;
}
function get_server_data(){
    const serv_whiout_main = Object.assign({}, chaos_servers);;
    delete serv_whiout_main[main_server];
    return {
        "main_serveur" : chaos_servers[main_server],
        "main_serveur_id" : main_server,
        all_others_serveur : serv_whiout_main
    }
}

module.exports = {
  retrive_market_data,
  get_server_data,
};
