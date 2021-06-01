import * as gecko from './gecko.js';

const cgc = new gecko.CoinGeckoClient()

//console.log(await cgc.ping())
//console.log(cgc.trending())

console.log(await getCoin('bitcoin'))

async function getCoin(id) {
    const input = {
        'id': id,
        'market_data': true,
        'localization': false,
        'tickers': false,
        'community_data': false,
        'sparkline': false,
        'developer_data': false
    };
    return await cgc.coinId(input);
}