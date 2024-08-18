function calculatePercentage(reference, test) {
    if (reference === 0) {
        return;
    }

    const difference = test - reference;
    const percentage = (difference / reference) * 100;
    const result = percentage.toFixed(1);
    return percentage.toFixed(1); // Retourne le pourcentage avec deux décimales
}


document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.div-item-tab').forEach(item_tab => {
        const main_serv = item_tab.querySelector('.main-server');
        let bottom_value_main_server = 1000000000;
        main_serv.querySelectorAll('.main-price').forEach(item_price =>{
            bottom_value_main_server = Math.min(bottom_value_main_server , Number(item_price.innerText));
        });

        item_tab.querySelectorAll('.serveur-values').forEach(serveur_value => {
           serveur_value.querySelectorAll('.other-price').forEach(price_value => {
               const percentage  = calculatePercentage(bottom_value_main_server, Number(price_value.innerText));
               let color_class ="";
               if( percentage > 20 ){
                   color_class = 'red';
               } else if (percentage<= 20 && percentage >= -5 ) {
                   color_class = 'orange';
               } else if ( percentage < -5 && percentage>= -15 ) {
                   color_class = 'yellow';
               } else if (percentage < -15) {
                   color_class = 'green';
               } else {
                   color_class = 'purple';
               }
               price_value.parentElement.classList.add(color_class);
           })
        });




    });
});