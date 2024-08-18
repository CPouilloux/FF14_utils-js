const fs = require('fs');
const csv = require('csv-parser');


/**
 * @typedef {Object} MonObjet
 * @property {string} id - L'identifiant unique.
 * @property {string} name - Le nom de l'objet.
 * @property {string} description - La description de l'objet.
 * @property {string} icon - L'icône associée à l'objet.
 * @property {string} level - Le niveau de l'objet.
 * @property {string} filter_group - Le groupe de filtre de l'objet.
 * @property {string} item_search_category - La catégorie de recherche de l'objet.
 * @property {string} class_job_category - La catégorie de classe/métier de l'objet.
 * @property {string} name_fr 
 * @property {string} name_en
 */

/**
 * Une classe représentant un objet avec des propriétés spécifiques.
 */
class Ff14_item {
    constructor(row) {
        this.id = row['﻿key'];
        this.name = row['9'];
        this.description = row['8'];
        this.icon = row['10'];
        this.level = row['11'];
        this.filter_group = row['13'];
        this.item_search_category = row['16'];
        this.class_job_category = row['43'];
    };
    updatewithJson(json_data) {
        try {
            this.name_fr = json_data['fr'];
            this.name_en = json_data['en'];
            this.is_same_name = this.name === this.name_en;
        } catch (error) {
            //console.log(json_data);
        }

    };
}


function lireCSV(cheminFichier) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(cheminFichier)
            .pipe(csv())
            .on('data', (row) => {
                results.push(row);
            })
            .on('end', () => {
                resolve(results); // Résoudre la promesse avec les données
            })
            .on('error', (error) => {
                reject(error); // Rejeter la promesse en cas d'erreur
            });
    });
}

async function chargerJSON(cheminFichier) {
    return new Promise((resolve, reject) => {
        fs.readFile(cheminFichier, 'utf8', (err, data) => {
            if (err) {
                reject(err); // Rejette la promesse si une erreur se produit lors de la lecture du fichier
            } else {
                try {
                    const dictionnaire = JSON.parse(data); // Convertit le contenu du fichier en objet JavaScript
                    resolve(dictionnaire); // Résout la promesse avec l'objet
                } catch (parseError) {
                    reject(parseError); // Rejette la promesse si une erreur de parsing se produit
                }
            }
        });
    });
}



async function getOnlyUsefullData(items) {
    let json_data;
    try {
        const cheminFichier = 'data-files/items.json';
        json_data = await chargerJSON(cheminFichier);
    } catch (error) {
        console.error('Erreur lors du chargement du fichier JSON:', error);
        return;
    }
    const to_return = {};
    for (let i = 3; i < items.length; i++) {
        const elm = new Ff14_item(items[i]);
        if (elm.name !== "") {
            elm.updatewithJson(json_data[elm.id]);
            to_return[elm.id] = elm;
        }
    }
    return to_return;
}


/**
 * Retourne un dictionnaire d'objets `MonObjet` avec des identifiants uniques comme clés.
 * @returns {Object.<string, Ff14_item>} - Un dictionnaire d'objets `Ff14_item` indexés par `id`.
 */
async function recuperationItemsFromFiles() {
    const items_data = await lireCSV("data-files/Item.csv");
    const ff14_items = await getOnlyUsefullData(items_data);
    return ff14_items;
}

module.exports = recuperationItemsFromFiles;