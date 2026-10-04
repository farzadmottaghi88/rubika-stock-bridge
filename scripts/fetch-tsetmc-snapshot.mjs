const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const CDN = "https://cdn.tsetmc.com/api/ClosingPrice/GetMarketWatch?market=0&paperTypes[0]=1&paperTypes[1]=2&paperTypes[2]=3&paperTypes[3]=4&paperTypes[4]=5&paperTypes[5]=6&paperTypes[6]=7&paperTypes[7]=8&paperTypes[8]=9&withBestLimits=false&hEven=0&RefID=0";
const CLIENT = "https://cdn.tsetmc.com/api/ClientType/GetClientTypeAll";

function n(v){ const x=Number(v); return Number.isFinite(x)?x:null; }

async function get(url){
  const r=await fetch(url,{headers:{accept:"application/json","user-agent":UA}});
  const text=await r.text();
  if(!r.ok) throw new Error(`${r.status} ${url} ${text.slice(0,200)}`);
  return JSON.parse(text);
}

function rowsFromMarket(j){
  const a=j?.marketwatch ?? j?.marketWatch ?? j?.marketWatchDto ?? [];
  return a.map(x=>({
    insCode:String(x.insCode??x.inscode??x.InsCode??""),
    symbol:x.lVal18AFC??x.symbol??"",
    name:x.lVal30??x.name??"",
    lastPrice:n(x.pDrCotVal??x.pl??x.last),
    closePrice:n(x.pClosing??x.pc??x.close),
    openPrice:n(x.pf??x.open),
    yesterdayPrice:n(x.py??x.priceYesterday),
    lowPrice:n(x.priceMin??x.low),
    highPrice:n(x.priceMax??x.high),
    tradeCount:n(x.zTotTran??x.tno??x.count),
    volume:n(x.qTotTran5J??x.tvol??x.volume),
    tradeValue:n(x.qTotCap??x.tval??x.value),
    baseVolume:n(x.baseVol??x.bvol),
    eps:n(x.eps??x.estimatedEPS),
    pe:n(x.pe),
    heven:n(x.hEven??x.heven)
  })).filter(x=>x.insCode&&x.symbol&&Number.isFinite(x.lastPrice));
}

function mergeClients(rows,j){
  const a=j?.clientTypeAllDto??j?.clientTypeAll??j??[];
  const map=new Map(a.map(x=>[String(x.insCode??x.inscode??x.InsCode??""),x]));
  return rows.map(r=>{
    const x=map.get(r.insCode); if(!x) return r;
    const buy=n(x.naturalBuyVolume??x.buy_I_Volume??x.qBuyN); const sell=n(x.naturalSellVolume??x.sell_I_Volume??x.qSellN);
    const bc=n(x.naturalBuyCount??x.buy_I_Count??x.nBuyCount); const sc=n(x.naturalSellCount??x.sell_I_Count??x.nSellCount);
    const bp=bc>0&&sc>0?(buy/bc)/(sell/sc):null;
    const flow=(buy!=null&&sell!=null&&r.lastPrice!=null)?(buy-sell)*r.lastPrice:null;
    return {...r,naturalBuyCount:bc,naturalSellCount:sc,naturalBuyVolume:buy,naturalSellVolume:sell,buyerPower:bp,realMoneyFlow:flow};
  });
}

try{
  const [m,c]=await Promise.all([get(CDN),get(CLIENT)]);
  let rows=mergeClients(rowsFromMarket(m),c);
  const hevens=rows.map(x=>x.heven).filter(Number.isFinite);
  const snapshot={
    status:rows.length>=500?"LIVE_VERIFIED":"LIVE_NOT_VERIFIED",
    verified:rows.length>=500,
    source:"github-actions-tsetmc-cdn",
    generatedAt:new Date().toISOString(),
    receivedAt:new Date().toISOString(),
    marketDate:null,
    symbolCount:rows.length,
    latestHeven:hevens.length?Math.max(...hevens):null,
    rows
  };
  await import("node:fs/promises").then(fs=>fs.writeFile("public/data/tsetmc-market.json",JSON.stringify(snapshot)));
  if(rows.length<500) throw new Error(`Only ${rows.length} valid rows received`);
  console.log(JSON.stringify({ok:true,symbolCount:rows.length,latestHeven:snapshot.latestHeven}));
}catch(e){
  console.error(e);
  process.exit(1);
}
