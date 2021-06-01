import { CoinGeckoClient } from './gecko.js';
//import { CoinGeckoClient } from 'https://deno.land/x/coingeckoapi@0.0.11f/src/index.ts';
import { Bot, session, InlineKeyboard, webhookCallback } from "https://deno.land/x/grammy@v1.1.6/mod.ts";
//import "https://deno.land/x/dotenv/load.ts";

const { files, diagnostics } = await Deno.emit("./index.js", {
    compilerOptions: {
      checkJs: true,
    },
});

Deno.CompilerOptions({ chekcJs: true})

/* const { files, diagnostics } = await Deno.emit("./index.ts", {
    bundle: "module",
});
 */

const cgc = new CoinGeckoClient
const bot = new Bot(Deno.env.get('BOT_TOKEN'));


async function getCoin(id) {
    input = {
        'id': id,
        'market_data': true,
        'localization': false,
        'tickers': false,
        'community_data': false,
        'sparkline': false,
        'developer_data': false
    }
    return await cgc.coinId(input);
}

async function getCoinList() {
    return await cgc.coinList();
    return [{
        "id": "bitcoin",
        "symbol": "btc",
        "name": "Bitcoin"
    }]
}

async function simplePrice(id, currency) {
    input = {
        vs_currencies: currency,
        ids: id,
        include_market_cap: false,
        include_24hr_vol: false,
        include_24hr_change: false,
        include_last_updated_at: false,
    }

    const simplePrice = await cgc.simplePrice(input);
    return simplePrice[id][currency]
}

async function trendingKb() {
    //console.log(await cgc.simplePrice('bitcoin','usd'))
    const trending =  await cgc.trending();

    const keyboard = new InlineKeyboard

    try {
        if (trending.error) throw new Error(trending.error)
        if ((trending.coins).length === 0) throw new Error("CoinGecko won't provide us with the data")
    } catch (error){
        console.error(error.message)
        return keyboard
    }

    trending.coins.forEach(coin => {
        keyboard.text(coin.item.name, coin.item.id).row()
    });

    return keyboard
}

const mainKb = new InlineKeyboard()
    .text('🔍 Show coin', 'show')

bot.use(session({
    initial() {
        return { 
            wantedCoin: '',
            localCurrency: 'usd' };
        },      
    })
)


bot.command('start', async ctx => {
    delete ctx.session
    ctx.reply(`Hi ${ctx.from.first_name}👋! I can tell you all secrets about your fave cryptos🔮, what crypto are you interested in?🚀`, {
        reply_markup: await trendingKb()
    })
    //return next()
})


bot.on(":text", (ctx, next) => {
    const session = ctx.session
    if(!session.wantedCoin) session.wantedCoin = ctx.msg.text
    next()
})

bot.callbackQuery("show", async (ctx, next) => {
    const session = ctx.session
    const localCurrency = session.localCurrency
    const coin = session.coin || await next()
    if (!session.coin?.market_data?.ath) session.coin = await getCoin(coin.id)
    const market_data = session.coin.market_data

    const formattedString = 
`🌟 *${coin.name}*
💵 *Price:* ${(market_data.current_price[localCurrency]).toLocaleString(undefined, { maximumFractionDigits: 2})} ${localCurrency.toUpperCase()}
📉 *Volume 24h:* ${(market_data.total_volume[localCurrency]).toLocaleString(undefined, { maximumFractionDigits: 0})} ${localCurrency.toUpperCase()}
💰 *Market Cap:* ${(market_data.market_cap[localCurrency]).toLocaleString(undefined, { maximumFractionDigits: 0})} ${localCurrency.toUpperCase()}

*1d change:* ${(market_data.price_change_percentage_24h_in_currency[localCurrency] || 0).toFixed(2)} %
*7d change:* ${(market_data.price_change_percentage_7d_in_currency[localCurrency] || 0).toFixed(2)} %
*30d change:* ${(market_data.price_change_percentage_30d_in_currency[localCurrency] || 0).toFixed(2)} %
*1y change:* ${(market_data.price_change_percentage_1y_in_currency[localCurrency] || 0).toFixed(2)} %
*from ${(market_data.ath[localCurrency]).toLocaleString(undefined, { maximumFractionDigits: 2})} ${localCurrency.toUpperCase()} (ATH):* ${(market_data.ath_change_percentage[localCurrency]).toFixed(2)} % `

    const urlKb = new InlineKeyboard()
        .url(`See more about ${coin.name}`, `https://www.coingecko.com/en/coins/${coin.id}`)

    await ctx.reply(formattedString, {
        parse_mode: 'Markdown',
        reply_markup: urlKb
    })
    
    //await ctx.answerCallbackQuery("You were curious, indeed!");
    //await next()
});


bot.on("callback_query:data", (ctx, next) => {
    const session = ctx.session
    //if(!session.wantedCoin) 
    session.wantedCoin = ctx.callbackQuery.data
    delete session.coin 
    ctx.answerCallbackQuery()
    next()
})


bot.filter(ctx => (!ctx.session.amount && ctx.session.coin), async (ctx, next) => {
    const session = ctx.session
    if (isNaN(ctx.msg.text)) {
        session.wantedCoin = ctx.msg.text
        delete session.coin
        return await next()
    }
    const localCurrency = session.localCurrency
    session.coin.market_data = session.coin.market_data || {}
    const current_price = session.coin.market_data.current_price = session.coin.market_data.current_price || {}
    if (!current_price[localCurrency]) current_price[localCurrency] = await simplePrice(session.coin.id, localCurrency)

    const amount = ctx.msg.text
    session.amount = amount


    function converter (amount, rate) {
        return amount / rate
    }

    session.exchanged = converter(amount, current_price[localCurrency])

    await next()
})

bot.filter(ctx => (!ctx.session.coin), async (ctx, next) => {
    const session = ctx.session
    if (!session.coinList) session.coinList = await getCoinList()
    session.coin = session.coinList.find( c => {
        if (c.id === session.wantedCoin || c.symbol === session.wantedCoin) return c 
    });

    try {
        if ( session.coin === undefined ) { 
            delete session.wantedCoin
            throw new Error("I'm not sure this coin exists")
        }

        ctx.reply(`Picked *${session.coin.name}* aka [${session.coin.symbol.toUpperCase()}]. Please provide the amount you would like to convert or click the button below`, {
            parse_mode: 'Markdown',
            reply_markup: mainKb
        })
    } catch (error) {
        ctx.reply(error.message)
    }
})


bot.filter(ctx => (ctx.session.exchanged), async (ctx, next) => {
    const session = ctx.session
    const localCurrency = session.localCurrency
    const amount = parseInt(session.amount)
    const exchanged = session.exchanged

    const formattedString = `${(amount).toLocaleString(undefined, { maximumFractionDigits: 2})} ${(localCurrency).toUpperCase()} = ${(exchanged).toLocaleString(undefined, { maximumFractionDigits: 2})} ${(session.coin.symbol).toUpperCase()}`

    await ctx.reply(formattedString)

    delete session.amount
    delete session.exchanged

    await next()
})


// Catch errors and log them
bot.catch(err => console.error(err))

// Start bot!
//bot.start()
//app.use(webhookCallback(bot, "express"));
addEventListener("fetch", webhookCallback(bot, "express"))