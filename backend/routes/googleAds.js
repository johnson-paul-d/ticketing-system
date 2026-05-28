import { useState, useMemo, useCallback } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, ComposedChart,
  ScatterChart, Scatter, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PieChart, Pie, Cell, FunnelChart, Funnel, LabelList, Treemap,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

/* ═══════════════════════════════════════════════════════════════
   DESIGN SYSTEM — Bloomberg Terminal × Dark Data Studio
═══════════════════════════════════════════════════════════════ */
const DS = {
  bg:        "#090B10",
  bgCard:    "#0F1219",
  bgHover:   "#141820",
  bgSurface: "#181C26",
  border:    "#1E2333",
  borderHi:  "#2A3048",
  text:      "#E8EAF0",
  textSub:   "#7A8099",
  textMuted: "#454D66",
  blue:      "#3B82F6",
  blueHi:    "#60A5FA",
  cyan:      "#06B6D4",
  green:     "#10B981",
  greenHi:   "#34D399",
  amber:     "#F59E0B",
  red:       "#EF4444",
  redHi:     "#F87171",
  purple:    "#8B5CF6",
  pink:      "#EC4899",
  teal:      "#14B8A6",
  orange:    "#F97316",
  indigo:    "#6366F1",
};

const CAMP_COLORS = [DS.blue, DS.cyan, DS.green, DS.amber, DS.purple, DS.pink, DS.teal, DS.orange];

/* ═══════════════════════════════════════════════════════════════
   FORMATTERS
═══════════════════════════════════════════════════════════════ */
const F = {
  $: v => v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(1)}K` : `$${Number(v).toFixed(2)}`,
  n: v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(1)}K` : Math.round(v).toLocaleString(),
  pct: v => `${Number(v).toFixed(2)}%`,
  x: v => `${Number(v).toFixed(2)}×`,
  dec: v => Number(v).toFixed(2),
};

/* ═══════════════════════════════════════════════════════════════
   MOCK DATA
═══════════════════════════════════════════════════════════════ */
function seed(s) { let x=s; return ()=>{ x=Math.sin(x)*10000; return x-Math.floor(x); }; }

function genTrends(days=90) {
  const r=seed(42); const data=[];
  let spend=1600,conv=16,clicks=380,impr=26000,phones=3,stores=8;
  for(let i=days;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    spend+=((r()-0.46)*200); conv+=((r()-0.45)*3.5);
    clicks+=((r()-0.45)*45); impr+=((r()-0.45)*900);
    data.push({
      date:d.toISOString().slice(0,10),
      spend:Math.max(700,+spend.toFixed(2)),
      conversions:Math.max(3,Math.round(conv)),
      clicks:Math.max(90,Math.round(clicks)),
      impressions:Math.max(9000,Math.round(impr)),
      phoneConversions:Math.max(0,Math.round(phones+(r()-0.5)*2)),
      storeVisits:Math.max(0,Math.round(stores+(r()-0.5)*4)),
      invalidClicks:Math.max(0,Math.round(clicks*0.02)),
      viewThroughConv:Math.max(0,Math.round(conv*0.12)),
      allConversions:Math.max(conv,Math.round(conv*1.18)),
    });
  }
  return data;
}

const CAMPAIGN_DEFS = [
  { campaign:"Brand Awareness",    type:"Display",  network:"Display",  matchTypes:{Broad:60,Phrase:25,Exact:15}, status:"Active",  labels:["Brand","Awareness"], budget:22000 },
  { campaign:"Retargeting – Cart", type:"Search",   network:"Search",   matchTypes:{Broad:20,Phrase:40,Exact:40}, status:"Active",  labels:["Retargeting"],      budget:15000 },
  { campaign:"Performance Max",    type:"PMax",     network:"All",      matchTypes:{Broad:100,Phrase:0,Exact:0},  status:"Active",  labels:["PMax","Scale"],     budget:25000 },
  { campaign:"Search – Generic",   type:"Search",   network:"Search",   matchTypes:{Broad:45,Phrase:35,Exact:20}, status:"Active",  labels:["Generic"],          budget:12000 },
  { campaign:"Display Prospecting",type:"Display",  network:"Display",  matchTypes:{Broad:80,Phrase:15,Exact:5},  status:"Paused",  labels:["Prospecting"],      budget:8000  },
  { campaign:"Shopping Feed",      type:"Shopping", network:"Shopping", matchTypes:{Broad:100,Phrase:0,Exact:0},  status:"Active",  labels:["Shopping","Feed"],  budget:18000 },
  { campaign:"YouTube Awareness",  type:"Video",    network:"Video",    matchTypes:{Broad:100,Phrase:0,Exact:0},  status:"Active",  labels:["Video","Brand"],    budget:10000 },
  { campaign:"RLSA – High Intent", type:"Search",   network:"Search",   matchTypes:{Broad:15,Phrase:30,Exact:55}, status:"Active",  labels:["RLSA","Intent"],    budget:13000 },
];

function genCampaigns() {
  const r=seed(77);
  return CAMPAIGN_DEFS.map(def=>{
    const cost=def.budget*(0.75+r()*0.35);
    const impr=def.type==="Display"?280000+r()*150000:def.type==="Video"?550000+r()*200000:80000+r()*100000;
    const clicks=Math.round(impr*(0.005+r()*0.04));
    const conv=Math.round(clicks*(0.02+r()*0.12));
    const absTopIS=20+r()*50; const topIS=absTopIS+(10+r()*25);
    const wonIS=40+r()*40; const lostBudget=5+r()*20; const lostRank=Math.max(0,100-wonIS-lostBudget);
    return {
      ...def, cost:+cost.toFixed(2), impressions:Math.round(impr), clicks, conversions:conv,
      avg_cpc:+(cost/clicks).toFixed(2), revenue:+(conv*125).toFixed(2),
      absTopIS:+absTopIS.toFixed(1), topIS:+Math.min(100,topIS).toFixed(1),
      wonIS:+wonIS.toFixed(1), lostBudgetIS:+lostBudget.toFixed(1), lostRankIS:+lostRank.toFixed(1),
      clickShare:+(35+r()*45).toFixed(1), qualityScore:+(4+r()*6).toFixed(1),
      phoneConversions:Math.round(conv*0.12), storeVisits:Math.round(conv*0.25),
      viewThroughConv:Math.round(conv*0.15), allConversions:Math.round(conv*1.2),
      budget:def.budget, budgetUtil:+(cost/def.budget*100).toFixed(1),
    };
  });
}

function genKeywords() {
  const terms=[
    "buy shoes online","running shoes sale","best sneakers","cheap athletic shoes",
    "shoe store near me","mens running shoes","womens sneakers","kids shoes discount",
    "athletic footwear","shoe deals today","brand name shoes","running gear online",
    "trail running shoes","basketball shoes","waterproof boots","casual sneakers",
    "leather dress shoes","work boots sale","orthopedic shoes","wide width shoes",
  ];
  const r=seed(99);
  return terms.map((kw,i)=>({
    keyword:kw, matchType:["Broad","Phrase","Exact"][Math.floor(r()*3)],
    status:r()>0.15?"Active":"Paused",
    avg_cpc:+(0.8+r()*7).toFixed(2),
    conversion_rate:+(r()*11).toFixed(2),
    cost:+(150+r()*4500).toFixed(2),
    clicks:Math.floor(60+r()*1000),
    impressions:Math.floor(600+r()*14000),
    quality_score:Math.floor(3+r()*8),
    firstPageCpc:+(1.5+r()*4).toFixed(2),
    topPageCpc:+(2.5+r()*6).toFixed(2),
    firstPosCpc:+(4+r()*8).toFixed(2),
    conversions:Math.floor(r()*80),
    searchVolume:Math.floor(500+r()*50000),
    competition:["Low","Medium","High"][Math.floor(r()*3)],
  }));
}

function genHourly() {
  const r=seed(11);
  return Array.from({length:24},(_,h)=>{
    const peak=h>=8&&h<=21; const wkndDip=h<10||h>22;
    return {
      hour:`${String(h).padStart(2,"0")}:00`, h,
      clicks:Math.floor(peak?80+r()*260:10+r()*45),
      conversions:Math.floor(peak?4+r()*20:r()*4),
      spend:+(peak?110+r()*400:12+r()*65).toFixed(2),
      cpa:+(peak?80+r()*60:150+r()*100).toFixed(2),
    };
  });
}

function genDayOfWeek() {
  const r=seed(55);
  return ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d,i)=>{
    const weekday=i<5; const peak=i===1||i===2||i===3;
    return {
      day:d, isWeekend:!weekday,
      clicks:Math.floor(weekday?300+r()*200:150+r()*120),
      conversions:Math.floor(weekday?18+r()*15:8+r()*10),
      spend:+(weekday?1200+r()*800:600+r()*500).toFixed(2),
      ctr:+(weekday?1.5+r()*1.2:1.0+r()*0.8).toFixed(2),
      cvr:+(weekday?3+r()*4:2+r()*3).toFixed(2),
    };
  });
}

function genSearchTerms() {
  const r=seed(33);
  return [
    "buy nike shoes online","nike running shoes cheap","best running shoes 2024",
    "adidas shoes sale","cheap sneakers near me","running shoe store",
    "on cloud shoes review","hoka shoes discount","new balance sale",
    "brooks running shoes","saucony runners","asics gel nimbus",
    "womens trail shoes","waterproof hiking shoe","wide width running",
  ].map(t=>({
    term:t, matchedKeyword:["running shoes sale","buy shoes online","athletic footwear"][Math.floor(r()*3)],
    clicks:Math.floor(20+r()*400), impressions:Math.floor(100+r()*5000),
    cost:+(30+r()*800).toFixed(2), conversions:Math.floor(r()*25),
    convRate:+(r()*12).toFixed(2), cpc:+(0.5+r()*6).toFixed(2),
    added:r()>0.7?"Added":r()>0.85?"Excluded":"—",
  }));
}

function genGeo() {
  const r=seed(22);
  return [
    "California","Texas","New York","Florida","Illinois",
    "Washington","Colorado","Georgia","Arizona","Oregon",
  ].map(state=>({
    state, clicks:Math.floor(200+r()*1800),
    conversions:Math.floor(10+r()*120),
    spend:+(500+r()*6000).toFixed(2),
    cvr:+(1+r()*8).toFixed(2), cpa:+(40+r()*200).toFixed(2),
  })).sort((a,b)=>b.spend-a.spend);
}

function genAuctionInsights() {
  const r=seed(88);
  return [
    "Competitor Alpha","Competitor Beta","Competitor Gamma","Competitor Delta","Your Brand",
  ].map((name,i)=>({
    name, isUs:i===4,
    impressionShare:+(i===4?55+r()*15:20+r()*40).toFixed(1),
    overlapRate:+(i===4?100:30+r()*50).toFixed(1),
    positionAboveRate:+(i===4?0:15+r()*40).toFixed(1),
    topImprShare:+(i===4?40+r()*20:10+r()*35).toFixed(1),
    absTopImprShare:+(i===4?18+r()*12:5+r()*20).toFixed(1),
  }));
}

/* ═══════════════════════════════════════════════════════════════
   COMPUTED KPIs
═══════════════════════════════════════════════════════════════ */
function computeKPIs(camps, trends, targetCPA, targetROAS) {
  const spend        = camps.reduce((s,c)=>s+c.cost,0);
  const clicks       = camps.reduce((s,c)=>s+c.clicks,0);
  const conv         = camps.reduce((s,c)=>s+c.conversions,0);
  const impr         = camps.reduce((s,c)=>s+c.impressions,0);
  const revenue      = camps.reduce((s,c)=>s+c.revenue,0);
  const allConv      = camps.reduce((s,c)=>s+c.allConversions,0);
  const phoneCalls   = camps.reduce((s,c)=>s+c.phoneConversions,0);
  const storeVisits  = camps.reduce((s,c)=>s+c.storeVisits,0);
  const viewThrough  = camps.reduce((s,c)=>s+c.viewThroughConv,0);
  const budgetTotal  = camps.reduce((s,c)=>s+c.budget,0);
  const invalidClks  = trends.reduce((s,r)=>s+r.invalidClicks,0);
  const trendClicks  = trends.reduce((s,r)=>s+r.clicks,0);

  const cpc          = clicks>0?spend/clicks:0;
  const ctr          = impr>0?(clicks/impr)*100:0;
  const cvr          = clicks>0?(conv/clicks)*100:0;
  const cpa          = conv>0?spend/conv:0;
  const roas         = spend>0?revenue/spend:0;
  const cpm          = impr>0?(spend/impr)*1000:0;
  const rpc          = clicks>0?revenue/clicks:0;
  const rpm          = impr>0?(revenue/impr)*1000:0;
  const profitMargin = 0.38;
  const profit       = revenue*profitMargin-spend;
  const roi          = spend>0?(profit/spend)*100:0;
  const breakEvenROAS= 1/profitMargin;
  const convValue    = spend>0?revenue/spend:0;
  const allCvr       = clicks>0?(allConv/clicks)*100:0;
  const allCpa       = allConv>0?spend/allConv:0;
  const avgIS        = camps.length>0?camps.reduce((s,c)=>s+c.wonIS,0)/camps.length:0;
  const avgAbsTopIS  = camps.length>0?camps.reduce((s,c)=>s+c.absTopIS,0)/camps.length:0;
  const avgTopIS     = camps.length>0?camps.reduce((s,c)=>s+c.topIS,0)/camps.length:0;
  const avgClickShare= camps.length>0?camps.reduce((s,c)=>s+c.clickShare,0)/camps.length:0;
  const invalidRate  = trendClicks>0?(invalidClks/trendClicks)*100:0;
  const budgetUtil   = budgetTotal>0?(spend/budgetTotal)*100:0;
  const vsTargetCPA  = targetCPA>0?((cpa-targetCPA)/targetCPA)*100:null;
  const vsTargetROAS = targetROAS>0?((roas-targetROAS)/targetROAS)*100:null;

  return {
    spend,clicks,conv,impr,revenue,allConv,phoneCalls,storeVisits,viewThrough,
    cpc,ctr,cvr,cpa,roas,cpm,rpc,rpm,profit,roi,breakEvenROAS,convValue,
    allCvr,allCpa,avgIS,avgAbsTopIS,avgTopIS,avgClickShare,invalidRate,
    budgetUtil,vsTargetCPA,vsTargetROAS,
  };
}

/* ═══════════════════════════════════════════════════════════════
   SMALL PRIMITIVES
═══════════════════════════════════════════════════════════════ */
function Tag({children, color=DS.textSub}) {
  return (
    <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",
      padding:"2px 6px",borderRadius:3,border:`1px solid ${color}33`,color,background:`${color}14`}}>
      {children}
    </span>
  );
}

function Delta({v, inverse=false, fmt="pct"}) {
  if(v==null) return null;
  const good = inverse ? v<=0 : v>=0;
  const color = good ? DS.green : DS.red;
  const arrow = v>=0 ? "▲" : "▼";
  return (
    <span style={{fontSize:10,fontWeight:700,color,marginLeft:4}}>
      {arrow} {Math.abs(v).toFixed(1)}{fmt==="%"?"%":""}
    </span>
  );
}

function MiniSparkline({data,dataKey,color=DS.blue,height=28}) {
  if(!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{top:2,right:0,bottom:0,left:0}}>
        <defs>
          <linearGradient id={`sg-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25}/>
            <stop offset="95%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#sg-${dataKey})`}
          strokeWidth={1.5} dot={false} isAnimationActive={false}/>
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TT({active,payload,label,fmts={}}) {
  if(!active||!payload?.length) return null;
  return (
    <div style={{background:DS.bgCard,border:`1px solid ${DS.borderHi}`,borderRadius:6,
      padding:"10px 14px",fontSize:11,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
      <p style={{fontWeight:700,marginBottom:6,color:DS.text,fontFamily:"'IBM Plex Mono',monospace"}}>{label}</p>
      {payload.map((p,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:6,color:DS.textSub,marginBottom:2}}>
          <span style={{width:6,height:6,borderRadius:1,background:p.color,display:"inline-block"}}/>
          <span style={{fontSize:10}}>{p.name}:</span>
          <span style={{fontWeight:700,color:DS.text,fontFamily:"'IBM Plex Mono',monospace"}}>
            {fmts[p.name]?fmts[p.name](p.value):p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   KPI CARD
═══════════════════════════════════════════════════════════════ */
function KPICard({label,value,sub,delta,deltaInverse,accent=DS.blue,sparkData,sparkKey,warn,size="md"}) {
  const fontSize = size==="lg"?30:size==="sm"?18:24;
  return (
    <div style={{background:DS.bgCard,border:`1px solid ${DS.border}`,borderRadius:8,
      padding:"14px 16px",display:"flex",flexDirection:"column",gap:4,
      position:"relative",overflow:"hidden",transition:"border-color 0.2s",
      cursor:"default",
    }}
    onMouseEnter={e=>e.currentTarget.style.borderColor=DS.borderHi}
    onMouseLeave={e=>e.currentTarget.style.borderColor=DS.border}>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",color:DS.textMuted,
        textTransform:"uppercase",fontFamily:"'IBM Plex Mono',monospace"}}>
        {label}
      </div>
      <div style={{fontSize,fontWeight:600,color:warn?"#F87171":DS.text,lineHeight:1,
        fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"-0.02em"}}>
        {value}
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:2}}>
        <span style={{fontSize:10,color:DS.textSub}}>{sub}</span>
        {delta!=null&&<Delta v={delta} inverse={deltaInverse} fmt="%"/>}
      </div>
      {sparkData&&(
        <div style={{position:"absolute",bottom:0,right:0,left:0,height:32,opacity:0.22,pointerEvents:"none"}}>
          <MiniSparkline data={sparkData} dataKey={sparkKey} color={accent} height={32}/>
        </div>
      )}
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:2,background:accent,borderRadius:"8px 0 0 8px"}}/>
    </div>
  );
}

function KPISection({title, children}) {
  return (
    <div style={{marginBottom:24}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.12em",color:DS.textMuted,
        textTransform:"uppercase",fontFamily:"'IBM Plex Mono',monospace",
        marginBottom:10,paddingBottom:6,borderBottom:`1px solid ${DS.border}`}}>
        {title}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CHART CARD
═══════════════════════════════════════════════════════════════ */
function ChartCard({title,sub,children,height=240,action,span=1}) {
  return (
    <div style={{background:DS.bgCard,border:`1px solid ${DS.border}`,borderRadius:8,
      padding:"16px 18px",gridColumn:`span ${span}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
        <div>
          <div style={{fontSize:12,fontWeight:600,color:DS.text,letterSpacing:"-0.01em"}}>{title}</div>
          {sub&&<div style={{fontSize:10,color:DS.textSub,marginTop:2}}>{sub}</div>}
        </div>
        {action}
      </div>
      <div style={{height}}>{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FILTER BAR
═══════════════════════════════════════════════════════════════ */
function Pill({label,active,onClick}) {
  return (
    <button onClick={onClick} style={{
      fontSize:10,fontWeight:600,padding:"3px 9px",borderRadius:4,cursor:"pointer",
      border:`1px solid ${active?DS.blue:DS.border}`,letterSpacing:"0.04em",
      background:active?`${DS.blue}22`:"transparent",
      color:active?DS.blueHi:DS.textSub,transition:"all 0.15s",
      fontFamily:"'IBM Plex Mono',monospace",
    }}>{label}</button>
  );
}

function FilterSection({label,children}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
      <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",color:DS.textMuted,
        textTransform:"uppercase",fontFamily:"'IBM Plex Mono',monospace",marginRight:2,whiteSpace:"nowrap"}}>
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterBar({f,setF,campaigns}) {
  const allLabels=[...new Set(campaigns.flatMap(c=>c.labels))].sort();
  return (
    <div style={{background:DS.bgCard,border:`1px solid ${DS.border}`,borderRadius:8,
      padding:"12px 16px",marginBottom:18,display:"flex",flexWrap:"wrap",
      gap:14,alignItems:"flex-start"}}>

      <FilterSection label="Period">
        {[{l:"7D",v:7},{l:"14D",v:14},{l:"30D",v:30},{l:"60D",v:60},{l:"90D",v:90},{l:"All",v:0}].map(p=>(
          <Pill key={p.v} label={p.l} active={f.period===p.v} onClick={()=>setF(x=>({...x,period:p.v}))}/>
        ))}
      </FilterSection>

      <div style={{width:1,background:DS.border,alignSelf:"stretch"}}/>

      <FilterSection label="Network">
        {["All","Search","Display","Shopping","Video"].map(n=>(
          <Pill key={n} label={n} active={f.network===n} onClick={()=>setF(x=>({...x,network:n}))}/>
        ))}
      </FilterSection>

      <div style={{width:1,background:DS.border,alignSelf:"stretch"}}/>

      <FilterSection label="Match Type">
        {["All","Broad","Phrase","Exact"].map(m=>(
          <Pill key={m} label={m} active={f.matchType===m} onClick={()=>setF(x=>({...x,matchType:m}))}/>
        ))}
      </FilterSection>

      <div style={{width:1,background:DS.border,alignSelf:"stretch"}}/>

      <FilterSection label="Status">
        {["All","Active","Paused"].map(s=>(
          <Pill key={s} label={s} active={f.status===s} onClick={()=>setF(x=>({...x,status:s}))}/>
        ))}
      </FilterSection>

      <div style={{width:1,background:DS.border,alignSelf:"stretch"}}/>

      <FilterSection label="Schedule">
        {["All","Weekday","Weekend"].map(s=>(
          <Pill key={s} label={s} active={f.schedule===s} onClick={()=>setF(x=>({...x,schedule:s}))}/>
        ))}
      </FilterSection>

      <div style={{width:1,background:DS.border,alignSelf:"stretch"}}/>

      <FilterSection label="Budget util.">
        {["All","Under 70%","70–90%","Over 90%"].map(b=>(
          <Pill key={b} label={b} active={f.budgetUtil===b} onClick={()=>setF(x=>({...x,budgetUtil:b}))}/>
        ))}
      </FilterSection>

      <div style={{width:1,background:DS.border,alignSelf:"stretch"}}/>

      <FilterSection label="Efficiency">
        {["All","Star","Good","Average","Poor"].map(e=>(
          <Pill key={e} label={e} active={f.efficiency===e} onClick={()=>setF(x=>({...x,efficiency:e}))}/>
        ))}
      </FilterSection>

      <div style={{width:1,background:DS.border,alignSelf:"stretch"}}/>

      <FilterSection label="Label">
        <select value={f.label} onChange={e=>setF(x=>({...x,label:e.target.value}))}
          style={{fontSize:10,padding:"3px 6px",borderRadius:4,border:`1px solid ${DS.border}`,
            background:DS.bgCard,color:DS.text,cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace"}}>
          <option value="All">All labels</option>
          {allLabels.map(l=><option key={l} value={l}>{l}</option>)}
        </select>
      </FilterSection>

      <div style={{width:1,background:DS.border,alignSelf:"stretch"}}/>

      <FilterSection label="Sort by">
        {["cost","conversions","clicks","cpa","roas","ctr"].map(s=>(
          <Pill key={s} label={s.toUpperCase()} active={f.sortBy===s} onClick={()=>setF(x=>({...x,sortBy:s}))}/>
        ))}
      </FilterSection>

      <div style={{width:1,background:DS.border,alignSelf:"stretch"}}/>

      <FilterSection label={`Min spend: ${F.$(f.minSpend)}`}>
        <input type="range" min={0} max={15000} step={500} value={f.minSpend}
          onChange={e=>setF(x=>({...x,minSpend:+e.target.value}))}
          style={{width:90,accentColor:DS.blue}}/>
      </FilterSection>

      <div style={{width:1,background:DS.border,alignSelf:"stretch"}}/>

      <FilterSection label={`Target CPA: ${f.targetCPA>0?F.$(f.targetCPA):"—"}`}>
        <input type="range" min={0} max={300} step={10} value={f.targetCPA}
          onChange={e=>setF(x=>({...x,targetCPA:+e.target.value}))}
          style={{width:80,accentColor:DS.amber}}/>
      </FilterSection>

      <FilterSection label={`Target ROAS: ${f.targetROAS>0?F.x(f.targetROAS):"—"}`}>
        <input type="range" min={0} max={10} step={0.25} value={f.targetROAS}
          onChange={e=>setF(x=>({...x,targetROAS:+e.target.value}))}
          style={{width:80,accentColor:DS.green}}/>
      </FilterSection>

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TABS
═══════════════════════════════════════════════════════════════ */
const TABS = ["Overview","Campaigns","Keywords","Auction","Scheduling","Geo & Search Terms"];

function TabBar({tab,setTab}) {
  return (
    <div style={{display:"flex",gap:0,borderBottom:`1px solid ${DS.border}`,marginBottom:18}}>
      {TABS.map(t=>(
        <button key={t} onClick={()=>setTab(t)} style={{
          fontSize:11,fontWeight:600,padding:"10px 16px",cursor:"pointer",
          border:"none",borderBottom:tab===t?`2px solid ${DS.blue}`:"2px solid transparent",
          background:"transparent",color:tab===t?DS.blueHi:DS.textSub,
          transition:"all 0.15s",letterSpacing:"0.03em",
        }}>{t}</button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EFFICIENCY HELPERS
═══════════════════════════════════════════════════════════════ */
function efficiencyOf(c) {
  const cvr = c.clicks>0?(c.conversions/c.clicks)*100:0;
  const roas = c.cost>0?c.revenue/c.cost:0;
  if(roas>=4&&cvr>=5) return "Star";
  if(roas>=2.5&&cvr>=3) return "Good";
  if(roas>=1.5) return "Average";
  return "Poor";
}

function EffTag({label}) {
  const map={Star:{bg:`${DS.green}22`,color:DS.greenHi},Good:{bg:`${DS.cyan}22`,color:DS.cyan},
    Average:{bg:`${DS.amber}22`,color:DS.amber},Poor:{bg:`${DS.red}22`,color:DS.redHi}};
  const s=map[label]||map.Average;
  return <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:3,
    background:s.bg,color:s.color,letterSpacing:"0.06em",textTransform:"uppercase"}}>{label}</span>;
}

function StatusDot({status}) {
  const color=status==="Active"?DS.green:DS.textMuted;
  return <span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",
    background:color,marginRight:5,boxShadow:status==="Active"?`0 0 6px ${DS.green}80`:undefined}}/>;
}

/* ═══════════════════════════════════════════════════════════════
   TABLE PRIMITIVES
═══════════════════════════════════════════════════════════════ */
function DataTable({cols,rows,maxRows=20}) {
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead>
          <tr>
            {cols.map(c=>(
              <th key={c.key} style={{padding:"7px 10px",textAlign:c.right?"right":"left",
                fontSize:9,fontWeight:700,color:DS.textMuted,textTransform:"uppercase",
                letterSpacing:"0.08em",borderBottom:`1px solid ${DS.border}`,whiteSpace:"nowrap",
                fontFamily:"'IBM Plex Mono',monospace"}}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0,maxRows).map((row,i)=>(
            <tr key={i} style={{borderBottom:`1px solid ${DS.border}`}}
              onMouseEnter={e=>e.currentTarget.style.background=DS.bgHover}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              {cols.map(c=>(
                <td key={c.key} style={{padding:"9px 10px",color:c.bold?DS.text:DS.textSub,
                  textAlign:c.right?"right":"left",whiteSpace:"nowrap",
                  fontFamily:c.mono?"'IBM Plex Mono',monospace":undefined,
                  fontWeight:c.bold?600:400,fontSize:c.mono?10:11}}>
                  {c.render?c.render(row):row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MINI PROGRESS BAR
═══════════════════════════════════════════════════════════════ */
function Bar2({value,max=100,color=DS.blue,height=4}) {
  const w=Math.min(100,(value/max)*100);
  return (
    <div style={{height,background:DS.bgSurface,borderRadius:2,overflow:"hidden",minWidth:60}}>
      <div style={{height:"100%",width:`${w}%`,background:color,borderRadius:2}}/>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   OVERVIEW TAB
═══════════════════════════════════════════════════════════════ */
function OverviewTab({kpis,trends,filteredCamps}) {
  const [trendM,setTrendM]=useState("spend");
  const trendCfg = {
    spend:   {color:DS.blue,  fmt:F.$,   label:"Spend"},
    conversions:{color:DS.green, fmt:v=>v, label:"Conversions"},
    clicks:  {color:DS.purple,fmt:F.n,   label:"Clicks"},
    impressions:{color:DS.amber,fmt:F.n,  label:"Impressions"},
  };
  const enriched=useMemo(()=>trends.map(r=>({...r,
    ctr:r.impressions>0?+((r.clicks/r.impressions)*100).toFixed(3):0,
    cpa:r.conversions>0?+(r.spend/r.conversions).toFixed(2):0,
  })),[trends]);

  const funnelData=[
    {name:"Impressions", value:kpis.impr, fill:DS.indigo},
    {name:"Clicks",      value:kpis.clicks,fill:DS.blue},
    {name:"Conversions", value:kpis.conv, fill:DS.green},
    {name:"Revenue conv.",value:Math.round(kpis.conv*0.85),fill:DS.teal},
  ];

  const waterfallData=[
    {name:"Ad Spend",    value:kpis.spend,     fill:DS.red},
    {name:"Revenue",     value:kpis.revenue,   fill:DS.green},
    {name:"Gross Profit",value:kpis.revenue*0.38, fill:DS.cyan},
    {name:"Net Profit",  value:kpis.profit,    fill:kpis.profit>0?DS.teal:DS.red},
  ];

  const ISdata=[
    {name:"Won",           value:kpis.avgIS,     fill:DS.green},
    {name:"Lost (Budget)", value:filteredCamps.reduce((s,c)=>s+c.lostBudgetIS,0)/Math.max(1,filteredCamps.length), fill:DS.amber},
    {name:"Lost (Rank)",   value:filteredCamps.reduce((s,c)=>s+c.lostRankIS,0)/Math.max(1,filteredCamps.length),   fill:DS.red},
    {name:"Other",         value:Math.max(0,100-kpis.avgIS-10-12),fill:DS.textMuted},
  ];

  return (
    <div>
      {/* KPI Sections */}
      <KPISection title="Core Performance">
        <KPICard label="Total Spend"     value={F.$(kpis.spend)}     sub="budget consumed"      accent={DS.blue}   sparkData={enriched} sparkKey="spend"       delta={-3.2}/>
        <KPICard label="Revenue (est.)"  value={F.$(kpis.revenue)}   sub="@ $125 avg. order"    accent={DS.green}  sparkData={enriched} sparkKey="conversions" delta={6.8}/>
        <KPICard label="Net Profit"      value={F.$(kpis.profit)}    sub="revenue·38% − spend"  accent={kpis.profit>0?DS.green:DS.red} delta={kpis.roi} warn={kpis.profit<0}/>
        <KPICard label="ROAS"            value={F.x(kpis.roas)}      sub="return on ad spend"   accent={kpis.roas>=3?DS.green:DS.amber} delta={1.4} warn={kpis.roas<kpis.breakEvenROAS}/>
        <KPICard label="Break-even ROAS" value={F.x(kpis.breakEvenROAS)} sub="min profitable ROAS" accent={DS.amber}/>
        <KPICard label="Conv. Value/Cost"value={F.x(kpis.convValue)} sub="revenue per $ spent"  accent={DS.cyan}/>
      </KPISection>

      <KPISection title="Clicks & Impressions">
        <KPICard label="Impressions"  value={F.n(kpis.impr)}    sub="total ad views"       accent={DS.indigo} sparkData={enriched} sparkKey="impressions" delta={5.2}/>
        <KPICard label="Clicks"       value={F.n(kpis.clicks)}  sub="total clicks"         accent={DS.blue}   sparkData={enriched} sparkKey="clicks"      delta={1.9}/>
        <KPICard label="CTR"          value={F.pct(kpis.ctr)}   sub="click-through rate"   accent={DS.purple} delta={0.3}/>
        <KPICard label="Avg CPC"      value={F.$(kpis.cpc)}     sub="cost per click"       accent={DS.coral}  delta={-0.8}/>
        <KPICard label="CPM"          value={F.$(kpis.cpm)}     sub="per 1K impressions"   accent={DS.textSub}/>
        <KPICard label="Rev / Click"  value={F.$(kpis.rpc)}     sub="revenue per click"    accent={DS.green}/>
        <KPICard label="Rev / 1K Impr"value={F.$(kpis.rpm)}     sub="revenue per mille"    accent={DS.teal}/>
        <KPICard label="Invalid Click Rate" value={F.pct(kpis.invalidRate)} sub="bot/invalid traffic" accent={DS.amber} warn={kpis.invalidRate>5}/>
      </KPISection>

      <KPISection title="Conversions">
        <KPICard label="Conversions"      value={F.n(kpis.conv)}    sub="primary goal"         accent={DS.green}  sparkData={enriched} sparkKey="conversions" delta={4.1}/>
        <KPICard label="All Conversions"  value={F.n(kpis.allConv)} sub="incl. cross-device"   accent={DS.teal}   delta={3.6}/>
        <KPICard label="Conv. Rate"       value={F.pct(kpis.cvr)}   sub="clicks → conversions" accent={DS.cyan}   delta={2.1}/>
        <KPICard label="All Conv. Rate"   value={F.pct(kpis.allCvr)}sub="all conv / clicks"    accent={DS.teal}/>
        <KPICard label="CPA"              value={F.$(kpis.cpa)}     sub="cost per conversion"  accent={DS.amber}  delta={-2.3}/>
        <KPICard label="All Conv. CPA"    value={F.$(kpis.allCpa)}  sub="incl. all conv."      accent={DS.amber}/>
        <KPICard label="Phone Calls"      value={F.n(kpis.phoneCalls)} sub="call conversions"  accent={DS.purple}/>
        <KPICard label="Store Visits"     value={F.n(kpis.storeVisits)} sub="offline visits"   accent={DS.indigo}/>
        <KPICard label="View-through Conv."value={F.n(kpis.viewThrough)} sub="view-assist conv."accent={DS.orange}/>
      </KPISection>

      <KPISection title="Auction & Budget">
        <KPICard label="Impr. Share"      value={F.pct(kpis.avgIS)}       sub="auctions won"        accent={DS.green}/>
        <KPICard label="Abs. Top IS"      value={F.pct(kpis.avgAbsTopIS)} sub="above all other ads" accent={DS.blue}/>
        <KPICard label="Top IS"           value={F.pct(kpis.avgTopIS)}    sub="top-of-page rate"    accent={DS.cyan}/>
        <KPICard label="Click Share"      value={F.pct(kpis.avgClickShare)} sub="of available clicks" accent={DS.purple}/>
        <KPICard label="Budget Util."     value={F.pct(kpis.budgetUtil)}  sub="spend / total budget" accent={kpis.budgetUtil>95?DS.red:kpis.budgetUtil>80?DS.amber:DS.green} warn={kpis.budgetUtil>95}/>
        <KPICard label="ROI"              value={F.pct(kpis.roi)}         sub="net profit / spend"   accent={kpis.roi>0?DS.green:DS.red} warn={kpis.roi<0}/>
      </KPISection>

      {/* Charts */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <ChartCard title="Performance trend" sub="Select metric"
          action={
            <div style={{display:"flex",gap:4}}>
              {Object.entries(trendCfg).map(([k,v])=>(
                <Pill key={k} label={k.slice(0,4).toUpperCase()} active={trendM===k} onClick={()=>setTrendM(k)}/>
              ))}
            </div>
          } height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={enriched} margin={{top:4,right:4,bottom:0,left:-10}}>
              <defs>
                <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={trendCfg[trendM].color} stopOpacity={0.2}/>
                  <stop offset="95%" stopColor={trendCfg[trendM].color} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} vertical={false}/>
              <XAxis dataKey="date" tick={{fontSize:8,fill:DS.textMuted,fontFamily:"monospace"}}
                tickFormatter={d=>d.slice(5)} interval="preserveStartEnd"/>
              <YAxis tick={{fontSize:8,fill:DS.textMuted,fontFamily:"monospace"}}
                tickFormatter={v=>trendCfg[trendM].fmt(v)} width={50}/>
              <Tooltip content={<TT fmts={{[trendCfg[trendM].label]:trendCfg[trendM].fmt}}/>}/>
              <Area type="monotone" dataKey={trendM} stroke={trendCfg[trendM].color}
                fill="url(#tg)" strokeWidth={1.8} dot={false} name={trendCfg[trendM].label}/>
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Conversion funnel" sub="Impressions → Revenue conversions" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart>
              <Funnel dataKey="value" data={funnelData} isAnimationActive={false}>
                {funnelData.map((d,i)=><Cell key={i} fill={d.fill} fillOpacity={0.85}/>)}
                <LabelList dataKey="name" position="right" fill={DS.textSub} fontSize={10}/>
                <LabelList dataKey="value" position="center" fill={DS.text} fontSize={10}
                  formatter={v=>F.n(v)} fontFamily="'IBM Plex Mono',monospace"/>
              </Funnel>
              <Tooltip formatter={v=>[F.n(v),"Count"]}/>
            </FunnelChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="P&L waterfall" sub="Spend → Revenue → Net Profit" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfallData} margin={{top:4,right:4,bottom:0,left:-10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} vertical={false}/>
              <XAxis dataKey="name" tick={{fontSize:9,fill:DS.textSub}}/>
              <YAxis tick={{fontSize:8,fill:DS.textMuted,fontFamily:"monospace"}} tickFormatter={v=>F.$(Math.abs(v))}/>
              <Tooltip formatter={v=>[F.$(Math.abs(v)),"Amount"]}/>
              <Bar dataKey="value" radius={[4,4,0,0]}>
                {waterfallData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Impression share breakdown" sub="Won · Lost budget · Lost rank" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={ISdata} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                paddingAngle={3} dataKey="value" isAnimationActive={false}>
                {ISdata.map((d,i)=><Cell key={i} fill={d.fill}/>)}
              </Pie>
              <Tooltip formatter={(v,n)=>[`${v.toFixed(1)}%`,n]}/>
              <Legend wrapperStyle={{fontSize:10,color:DS.textSub}}/>
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Spend vs Conversions dual-axis */}
      <div style={{marginBottom:14}}>
        <ChartCard title="Spend vs Conversions over time" sub="Dual-axis overlay · full period" height={200}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={enriched} margin={{top:4,right:4,bottom:0,left:-10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} vertical={false}/>
              <XAxis dataKey="date" tick={{fontSize:8,fill:DS.textMuted,fontFamily:"monospace"}}
                tickFormatter={d=>d.slice(5)} interval="preserveStartEnd"/>
              <YAxis yAxisId="l" tick={{fontSize:8,fill:DS.textMuted,fontFamily:"monospace"}}
                tickFormatter={v=>`$${(v/1000).toFixed(0)}K`} width={46}/>
              <YAxis yAxisId="r" orientation="right" tick={{fontSize:8,fill:DS.textMuted,fontFamily:"monospace"}} width={30}/>
              <Tooltip content={<TT fmts={{Spend:F.$,Conversions:v=>v}}/>}/>
              <Legend wrapperStyle={{fontSize:10,color:DS.textSub}}/>
              <Area yAxisId="l" type="monotone" dataKey="spend" stroke={DS.blue}
                fill={DS.blue} fillOpacity={0.07} strokeWidth={1.8} dot={false} name="Spend"/>
              <Line yAxisId="r" type="monotone" dataKey="conversions" stroke={DS.green}
                strokeWidth={1.8} dot={false} strokeDasharray="5 2" name="Conversions"/>
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CAMPAIGNS TAB
═══════════════════════════════════════════════════════════════ */
function CampaignsTab({camps}) {
  const donut=camps.map(c=>({name:c.campaign.slice(0,18),value:c.cost}));
  const totalSpend=donut.reduce((s,d)=>s+d.value,0);

  const radarData=useMemo(()=>{
    const metrics=["CTR","CVR","ROAS","IS","AbsTopIS"];
    return metrics.map(m=>{
      const row={metric:m};
      camps.slice(0,5).forEach(c=>{
        const ctr=c.impressions>0?(c.clicks/c.impressions)*100:0;
        const cvr=c.clicks>0?(c.conversions/c.clicks)*100:0;
        const roas=c.cost>0?c.revenue/c.cost:0;
        const map={CTR:Math.min(100,ctr/3*100),CVR:Math.min(100,cvr/8*100),ROAS:Math.min(100,roas/8*100),IS:c.wonIS,AbsTopIS:c.absTopIS*2};
        row[c.campaign.split(/[–-]/)[0].trim().slice(0,12)]=+map[m].toFixed(1);
      });
      return row;
    });
  },[camps]);
  const radarKeys=camps.slice(0,5).map(c=>c.campaign.split(/[–-]/)[0].trim().slice(0,12));

  const cols=[
    {key:"campaign",label:"Campaign",bold:true,render:r=>(
      <span style={{display:"flex",alignItems:"center",gap:6}}>
        <StatusDot status={r.status}/>
        <span style={{color:DS.text,fontWeight:600}}>{r.campaign}</span>
      </span>)},
    {key:"type",   label:"Type",  render:r=><Tag color={DS.blue}>{r.type}</Tag>},
    {key:"status", label:"Status",render:r=><Tag color={r.status==="Active"?DS.green:DS.textMuted}>{r.status}</Tag>},
    {key:"cost",   label:"Spend", right:true,mono:true,render:r=>F.$(r.cost)},
    {key:"budgetUtil",label:"Budget%",right:true,mono:true,
      render:r=><div style={{minWidth:80}}><span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:r.budgetUtil>90?DS.red:r.budgetUtil>70?DS.amber:DS.green}}>{r.budgetUtil}%</span><Bar2 value={r.budgetUtil} color={r.budgetUtil>90?DS.red:r.budgetUtil>70?DS.amber:DS.green} height={3}/></div>},
    {key:"impressions",label:"Impr.",right:true,mono:true,render:r=>F.n(r.impressions)},
    {key:"clicks", label:"Clicks",right:true,mono:true,render:r=>F.n(r.clicks)},
    {key:"ctr",    label:"CTR",   right:true,mono:true,render:r=>F.pct(r.impressions>0?(r.clicks/r.impressions)*100:0)},
    {key:"conversions",label:"Conv.",right:true,mono:true},
    {key:"cvr",    label:"CVR",   right:true,mono:true,render:r=>F.pct(r.clicks>0?(r.conversions/r.clicks)*100:0)},
    {key:"avg_cpc",label:"CPC",   right:true,mono:true,render:r=>F.$(r.avg_cpc)},
    {key:"cpa",    label:"CPA",   right:true,mono:true,render:r=>r.conversions>0?F.$(r.cost/r.conversions):"—"},
    {key:"revenue",label:"Revenue",right:true,mono:true,render:r=>F.$(r.revenue)},
    {key:"roas",   label:"ROAS",  right:true,mono:true,render:r=>F.x(r.cost>0?r.revenue/r.cost:0)},
    {key:"wonIS",  label:"IS%",   right:true,mono:true,render:r=><><span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10}}>{r.wonIS}%</span><Bar2 value={r.wonIS} color={DS.blue} height={3}/></>},
    {key:"eff",    label:"Efficiency",render:r=><EffTag label={efficiencyOf(r)}/>},
  ];

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <ChartCard title="Budget spend share" sub="Campaign cost distribution" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={donut} cx="50%" cy="50%" innerRadius={55} outerRadius={95}
                paddingAngle={2} dataKey="value" isAnimationActive={false}>
                {donut.map((_,i)=><Cell key={i} fill={CAMP_COLORS[i%CAMP_COLORS.length]}/>)}
              </Pie>
              <Tooltip formatter={(v,n)=>[`${F.$(v)} (${totalSpend>0?((v/totalSpend)*100).toFixed(1):0}%)`,n]}/>
              <Legend wrapperStyle={{fontSize:9,color:DS.textSub}} formatter={v=>v.length>20?v.slice(0,18)+"…":v}/>
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Campaign radar — efficiency" sub="Normalized 0–100 across top 5 campaigns" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{top:10,right:30,bottom:10,left:30}}>
              <PolarGrid stroke={DS.border}/>
              <PolarAngleAxis dataKey="metric" tick={{fontSize:9,fill:DS.textSub}}/>
              {radarKeys.map((k,i)=>(
                <Radar key={k} name={k} dataKey={k}
                  stroke={CAMP_COLORS[i]} fill={CAMP_COLORS[i]} fillOpacity={0.08} strokeWidth={1.5}/>
              ))}
              <Legend wrapperStyle={{fontSize:9,color:DS.textSub}} formatter={v=>v.length>14?v.slice(0,12)+"…":v}/>
              <Tooltip/>
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Clicks vs Conversions" sub="Grouped horizontal bar" height={240}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={camps} layout="vertical" margin={{top:0,right:10,bottom:0,left:110}}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} horizontal={false}/>
              <XAxis type="number" tick={{fontSize:8,fill:DS.textMuted,fontFamily:"monospace"}} tickFormatter={F.n}/>
              <YAxis dataKey="campaign" type="category" width={108}
                tick={{fontSize:9,fill:DS.textSub}} tickFormatter={v=>v.length>16?v.slice(0,14)+"…":v}/>
              <Tooltip content={<TT fmts={{Clicks:F.n,Conversions:v=>v}}/>}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              <Bar dataKey="clicks" fill={DS.blue} fillOpacity={0.85} radius={[0,3,3,0]} name="Clicks" barSize={7}/>
              <Bar dataKey="conversions" fill={DS.green} fillOpacity={0.85} radius={[0,3,3,0]} name="Conversions" barSize={7}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="IS: Won vs Lost Budget vs Lost Rank" sub="Stacked by campaign" height={240}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={camps} layout="vertical" margin={{top:0,right:10,bottom:0,left:110}}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} horizontal={false}/>
              <XAxis type="number" domain={[0,100]} tick={{fontSize:8,fill:DS.textMuted}} tickFormatter={v=>`${v}%`}/>
              <YAxis dataKey="campaign" type="category" width={108}
                tick={{fontSize:9,fill:DS.textSub}} tickFormatter={v=>v.length>16?v.slice(0,14)+"…":v}/>
              <Tooltip formatter={(v,n)=>[`${v.toFixed(1)}%`,n]}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              <Bar dataKey="wonIS"        stackId="a" fill={DS.green}  fillOpacity={0.85} name="Won IS"        barSize={7}/>
              <Bar dataKey="lostBudgetIS" stackId="a" fill={DS.amber}  fillOpacity={0.85} name="Lost (Budget)" barSize={7}/>
              <Bar dataKey="lostRankIS"   stackId="a" fill={DS.red}    fillOpacity={0.85} name="Lost (Rank)"   barSize={7}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Treemap */}
      <div style={{marginBottom:14}}>
        <ChartCard title="Campaign spend treemap" sub="Area = cost · color = ROAS tier" height={200}>
          <ResponsiveContainer width="100%" height="100%">
            <Treemap data={camps.map(c=>({
              name:c.campaign.slice(0,18),size:c.cost,
              roas:c.cost>0?c.revenue/c.cost:0,
            }))} dataKey="size" aspectRatio={4/3} isAnimationActive={false}
              content={({x,y,width,height,name,roas})=>{
                const color=roas>=4?DS.green:roas>=2.5?DS.cyan:roas>=1.5?DS.amber:DS.red;
                if(width<30||height<18) return null;
                return (
                  <g>
                    <rect x={x+1} y={y+1} width={width-2} height={height-2}
                      fill={color} fillOpacity={0.18} stroke={color} strokeWidth={1} strokeOpacity={0.5} rx={3}/>
                    {width>60&&<text x={x+8} y={y+16} fill={DS.text} fontSize={10} fontWeight={600}>{name}</text>}
                    {width>60&&height>30&&<text x={x+8} y={y+30} fill={color} fontSize={9} fontFamily="'IBM Plex Mono',monospace">ROAS {roas.toFixed(2)}×</text>}
                  </g>
                );
              }}>
            </Treemap>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Table */}
      <div style={{background:DS.bgCard,border:`1px solid ${DS.border}`,borderRadius:8,padding:"16px 18px"}}>
        <div style={{fontSize:12,fontWeight:600,color:DS.text,marginBottom:12}}>Campaign detail — all metrics</div>
        <DataTable cols={cols} rows={camps}/>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   KEYWORDS TAB
═══════════════════════════════════════════════════════════════ */
function KeywordsTab({keywords}) {
  const scatter=keywords.map(k=>({name:k.keyword,x:k.avg_cpc,y:k.conversion_rate,z:k.cost,qs:k.quality_score}));
  const qsBuckets=useMemo(()=>
    [1,2,3,4,5,6,7,8,9,10].map(qs=>({qs:`QS${qs}`,count:keywords.filter(k=>k.quality_score===qs).length,
      color:qs>=7?DS.green:qs>=5?DS.amber:DS.red})),[keywords]);
  const matchBreakdown=["Broad","Phrase","Exact"].map(m=>({
    match:m,
    keywords:keywords.filter(k=>k.matchType===m).length,
    spend:keywords.filter(k=>k.matchType===m).reduce((s,k)=>s+k.cost,0),
    conversions:keywords.filter(k=>k.matchType===m).reduce((s,k)=>s+k.conversions,0),
  }));

  const kwCols=[
    {key:"keyword",   label:"Keyword",   bold:true,render:r=><span style={{color:DS.text,fontWeight:500}}>{r.keyword}</span>},
    {key:"matchType", label:"Match",     render:r=><Tag color={r.matchType==="Exact"?DS.green:r.matchType==="Phrase"?DS.cyan:DS.amber}>{r.matchType}</Tag>},
    {key:"status",    label:"Status",    render:r=><Tag color={r.status==="Active"?DS.green:DS.textMuted}>{r.status}</Tag>},
    {key:"cost",      label:"Spend",     right:true,mono:true,render:r=>F.$(r.cost)},
    {key:"impressions",label:"Impr.",    right:true,mono:true,render:r=>F.n(r.impressions)},
    {key:"clicks",    label:"Clicks",    right:true,mono:true,render:r=>F.n(r.clicks)},
    {key:"avg_cpc",   label:"CPC",       right:true,mono:true,render:r=>F.$(r.avg_cpc)},
    {key:"conversion_rate",label:"CVR",  right:true,mono:true,render:r=>F.pct(r.conversion_rate)},
    {key:"conversions",label:"Conv.",    right:true,mono:true},
    {key:"quality_score",label:"QS",     right:true,
      render:r=><div style={{display:"flex",alignItems:"center",gap:6,minWidth:80}}>
        <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
          color:r.quality_score>=7?DS.green:r.quality_score>=5?DS.amber:DS.red}}>
          {r.quality_score}/10
        </span>
        <Bar2 value={r.quality_score} max={10} color={r.quality_score>=7?DS.green:r.quality_score>=5?DS.amber:DS.red} height={3}/>
      </div>},
    {key:"firstPageCpc",label:"1st Page CPC",right:true,mono:true,render:r=>F.$(r.firstPageCpc)},
    {key:"topPageCpc",  label:"Top CPC",    right:true,mono:true,render:r=>F.$(r.topPageCpc)},
    {key:"competition", label:"Competition",render:r=><Tag color={r.competition==="High"?DS.red:r.competition==="Medium"?DS.amber:DS.green}>{r.competition}</Tag>},
    {key:"signal",      label:"Signal",
      render:r=>{
        const s=r.conversion_rate>=5&&r.avg_cpc<=4?"Star":r.avg_cpc>6&&r.conversion_rate<2?"Pause":"Watch";
        return <Tag color={s==="Star"?DS.green:s==="Pause"?DS.red:DS.amber}>{s}</Tag>;
      }},
  ];

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:14}}>
        <ChartCard title="CPC vs Conv. Rate" sub="Bubble = spend · quadrant lines at avg" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{top:10,right:20,bottom:20,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border}/>
              <XAxis dataKey="x" name="CPC" tick={{fontSize:8,fill:DS.textMuted,fontFamily:"monospace"}}
                tickFormatter={v=>`$${v.toFixed(1)}`}
                label={{value:"Avg CPC",position:"insideBottom",offset:-8,fontSize:9,fill:DS.textMuted}}/>
              <YAxis dataKey="y" name="CVR" tick={{fontSize:8,fill:DS.textMuted,fontFamily:"monospace"}}
                tickFormatter={v=>`${v}%`}
                label={{value:"CVR%",angle:-90,position:"insideLeft",fontSize:9,fill:DS.textMuted}}/>
              <ZAxis dataKey="z" range={[30,500]} name="Spend"/>
              <ReferenceLine x={4}   stroke={DS.amber} strokeDasharray="4 3" strokeOpacity={0.4}/>
              <ReferenceLine y={4.5} stroke={DS.amber} strokeDasharray="4 3" strokeOpacity={0.4}/>
              <Tooltip cursor={{strokeDasharray:"3 3"}} content={({active,payload})=>{
                if(!active||!payload?.[0]) return null;
                const d=payload[0].payload;
                return(<div style={{background:DS.bgCard,border:`1px solid ${DS.borderHi}`,borderRadius:6,padding:"8px 12px",fontSize:10}}>
                  <p style={{fontWeight:700,color:DS.text,marginBottom:4,fontFamily:"'IBM Plex Mono',monospace"}}>{d.name}</p>
                  <p style={{color:DS.textSub}}>CPC: {F.$(d.x)} · CVR: {d.y.toFixed(1)}%</p>
                  <p style={{color:DS.textSub}}>Spend: {F.$(d.z)} · QS: {d.qs}/10</p>
                </div>);
              }}/>
              <Scatter data={scatter} fill={DS.purple} fillOpacity={0.65}/>
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Quality Score distribution" sub="Keyword count by QS bucket" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={qsBuckets} margin={{top:4,right:4,bottom:0,left:-10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} vertical={false}/>
              <XAxis dataKey="qs" tick={{fontSize:9,fill:DS.textSub}}/>
              <YAxis tick={{fontSize:8,fill:DS.textMuted}}/>
              <Tooltip/>
              <Bar dataKey="count" radius={[3,3,0,0]} name="Keywords">
                {qsBuckets.map((b,i)=><Cell key={i} fill={b.color}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Match type breakdown" sub="Spend · conversions by match type" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={matchBreakdown} margin={{top:4,right:4,bottom:0,left:-10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} vertical={false}/>
              <XAxis dataKey="match" tick={{fontSize:10,fill:DS.textSub}}/>
              <YAxis yAxisId="l" tick={{fontSize:8,fill:DS.textMuted}} tickFormatter={v=>F.$(v)} width={50}/>
              <YAxis yAxisId="r" orientation="right" tick={{fontSize:8,fill:DS.textMuted}} width={30}/>
              <Tooltip content={<TT fmts={{Spend:F.$,Conversions:v=>v}}/>}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              <Bar yAxisId="l" dataKey="spend" fill={DS.blue} fillOpacity={0.8} radius={[3,3,0,0]} name="Spend" barSize={20}/>
              <Bar yAxisId="r" dataKey="conversions" fill={DS.green} fillOpacity={0.8} radius={[3,3,0,0]} name="Conversions" barSize={20}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{background:DS.bgCard,border:`1px solid ${DS.border}`,borderRadius:8,padding:"16px 18px"}}>
        <div style={{fontSize:12,fontWeight:600,color:DS.text,marginBottom:12}}>Keyword intelligence — full table</div>
        <DataTable cols={kwCols} rows={[...keywords].sort((a,b)=>b.cost-a.cost)} maxRows={20}/>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AUCTION TAB
═══════════════════════════════════════════════════════════════ */
function AuctionTab({auctionInsights,camps}) {
  const ISstacked=camps.map(c=>({
    name:c.campaign.slice(0,16),wonIS:c.wonIS,lostBudget:c.lostBudgetIS,lostRank:c.lostRankIS,
    absTop:c.absTopIS,topIS:c.topIS,clickShare:c.clickShare,
  }));

  const aiCols=[
    {key:"name",        label:"Competitor",    bold:true,render:r=><span style={{color:r.isUs?DS.cyan:DS.text,fontWeight:r.isUs?700:500}}>{r.isUs?"★ "+r.name:r.name}</span>},
    {key:"impressionShare",label:"Impr. Share",right:true,mono:true,render:r=><><span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:r.isUs?DS.cyan:DS.text}}>{r.impressionShare}%</span><Bar2 value={r.impressionShare} color={r.isUs?DS.cyan:DS.textMuted}/></>},
    {key:"overlapRate", label:"Overlap Rate",  right:true,mono:true,render:r=>`${r.overlapRate}%`},
    {key:"positionAboveRate",label:"Pos. Above Rate",right:true,mono:true,render:r=>`${r.positionAboveRate}%`},
    {key:"topImprShare",label:"Top IS",        right:true,mono:true,render:r=>`${r.topImprShare}%`},
    {key:"absTopImprShare",label:"Abs. Top IS",right:true,mono:true,render:r=>`${r.absTopImprShare}%`},
  ];

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <ChartCard title="Impression share by campaign" sub="Won vs Lost Budget vs Lost Rank" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ISstacked} layout="vertical" margin={{top:0,right:10,bottom:0,left:120}}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} horizontal={false}/>
              <XAxis type="number" domain={[0,100]} tick={{fontSize:8,fill:DS.textMuted}} tickFormatter={v=>`${v}%`}/>
              <YAxis dataKey="name" type="category" width={118} tick={{fontSize:9,fill:DS.textSub}}/>
              <Tooltip formatter={(v,n)=>[`${v.toFixed(1)}%`,n]}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              <Bar dataKey="wonIS"      stackId="a" fill={DS.green}  fillOpacity={0.85} name="Won IS"        barSize={9}/>
              <Bar dataKey="lostBudget" stackId="a" fill={DS.amber}  fillOpacity={0.85} name="Lost Budget"   barSize={9}/>
              <Bar dataKey="lostRank"   stackId="a" fill={DS.red}    fillOpacity={0.85} name="Lost Rank"     barSize={9}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Click share & Abs. Top IS" sub="Campaign comparison" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ISstacked} layout="vertical" margin={{top:0,right:10,bottom:0,left:120}}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} horizontal={false}/>
              <XAxis type="number" domain={[0,100]} tick={{fontSize:8,fill:DS.textMuted}} tickFormatter={v=>`${v}%`}/>
              <YAxis dataKey="name" type="category" width={118} tick={{fontSize:9,fill:DS.textSub}}/>
              <Tooltip formatter={(v,n)=>[`${v.toFixed(1)}%`,n]}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              <Bar dataKey="clickShare" fill={DS.blue}   fillOpacity={0.85} name="Click Share"  barSize={7} radius={[0,3,3,0]}/>
              <Bar dataKey="absTop"     fill={DS.purple} fillOpacity={0.85} name="Abs. Top IS"  barSize={7} radius={[0,3,3,0]}/>
              <Bar dataKey="topIS"      fill={DS.cyan}   fillOpacity={0.85} name="Top IS"       barSize={7} radius={[0,3,3,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{background:DS.bgCard,border:`1px solid ${DS.border}`,borderRadius:8,padding:"16px 18px"}}>
        <div style={{fontSize:12,fontWeight:600,color:DS.text,marginBottom:12}}>Auction Insights — competitive analysis</div>
        <DataTable cols={aiCols} rows={[...auctionInsights].sort((a,b)=>b.impressionShare-a.impressionShare)}/>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCHEDULING TAB
═══════════════════════════════════════════════════════════════ */
function SchedulingTab({hourly,dayOfWeek}) {
  const maxClicks=Math.max(...hourly.map(h=>h.clicks));

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <ChartCard title="Clicks by hour of day" sub="Peak hours highlighted · 24h window" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourly} margin={{top:4,right:4,bottom:0,left:-15}}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} vertical={false}/>
              <XAxis dataKey="hour" tick={{fontSize:8,fill:DS.textMuted}} tickFormatter={v=>v.slice(0,2)} interval={2}/>
              <YAxis tick={{fontSize:8,fill:DS.textMuted}}/>
              <Tooltip content={<TT fmts={{Clicks:F.n,Conversions:v=>v,Spend:F.$}}/>}/>
              <Bar dataKey="clicks" name="Clicks" radius={[2,2,0,0]} barSize={10}>
                {hourly.map((h,i)=>{
                  const hr=h.h; const peak=hr>=8&&hr<=21;
                  return <Cell key={i} fill={peak?DS.blue:DS.textMuted} fillOpacity={0.7+(h.clicks/maxClicks)*0.3}/>;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="CPA by hour" sub="Cost per conversion · identify wasted hours" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourly} margin={{top:4,right:4,bottom:0,left:-10}}>
              <defs>
                <linearGradient id="cpag" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={DS.amber} stopOpacity={0.2}/>
                  <stop offset="95%" stopColor={DS.amber} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} vertical={false}/>
              <XAxis dataKey="hour" tick={{fontSize:8,fill:DS.textMuted}} tickFormatter={v=>v.slice(0,2)} interval={2}/>
              <YAxis tick={{fontSize:8,fill:DS.textMuted}} tickFormatter={v=>`$${v}`} width={42}/>
              <Tooltip content={<TT fmts={{CPA:F.$}}/>}/>
              <ReferenceLine y={120} stroke={DS.green} strokeDasharray="4 2" strokeOpacity={0.5}
                label={{value:"Target",fill:DS.green,fontSize:9}}/>
              <Area type="monotone" dataKey="cpa" stroke={DS.amber} fill="url(#cpag)"
                strokeWidth={1.8} dot={false} name="CPA"/>
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Day-of-week performance" sub="Clicks · Conversions · Spend" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dayOfWeek} margin={{top:4,right:4,bottom:0,left:-10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} vertical={false}/>
              <XAxis dataKey="day" tick={{fontSize:9,fill:DS.textSub}}/>
              <YAxis yAxisId="l" tick={{fontSize:8,fill:DS.textMuted}} tickFormatter={F.n}/>
              <YAxis yAxisId="r" orientation="right" tick={{fontSize:8,fill:DS.textMuted}} tickFormatter={v=>`$${(v/1000).toFixed(0)}K`} width={40}/>
              <Tooltip content={<TT fmts={{Clicks:F.n,Conversions:v=>v,Spend:F.$}}/>}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              <Bar yAxisId="l" dataKey="clicks" fill={DS.blue} fillOpacity={0.8} radius={[3,3,0,0]} name="Clicks" barSize={14}/>
              <Bar yAxisId="l" dataKey="conversions" fill={DS.green} fillOpacity={0.8} radius={[3,3,0,0]} name="Conversions" barSize={14}/>
              <Line yAxisId="r" type="monotone" dataKey="spend" stroke={DS.amber} strokeWidth={2} dot={{r:3}} name="Spend"/>
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Day-of-week CVR & CTR" sub="Conversion quality by day" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dayOfWeek} margin={{top:4,right:4,bottom:0,left:-10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} vertical={false}/>
              <XAxis dataKey="day" tick={{fontSize:9,fill:DS.textSub}}/>
              <YAxis tick={{fontSize:8,fill:DS.textMuted}} tickFormatter={v=>`${v}%`}/>
              <Tooltip content={<TT fmts={{CVR:v=>F.pct(v),CTR:v=>F.pct(v)}}/>}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              <Bar dataKey="cvr"  fill={DS.green}  fillOpacity={0.7} radius={[3,3,0,0]} name="CVR" barSize={14}/>
              <Bar dataKey="ctr"  fill={DS.purple} fillOpacity={0.7} radius={[3,3,0,0]} name="CTR" barSize={14}/>
              {dayOfWeek.map((d,i)=>d.isWeekend?<ReferenceLine key={i} x={d.day} stroke={DS.border} strokeDasharray="4 2"/>:null)}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Heatmap: hour × day spend */}
      <div style={{background:DS.bgCard,border:`1px solid ${DS.border}`,borderRadius:8,padding:"16px 18px",marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:600,color:DS.text,marginBottom:4}}>Hour × Spend intensity heatmap</div>
        <div style={{fontSize:10,color:DS.textSub,marginBottom:12}}>Darker = higher spend · identify scheduling opportunities</div>
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",fontSize:9,fontFamily:"'IBM Plex Mono',monospace"}}>
            <thead>
              <tr>
                <th style={{padding:"4px 8px",color:DS.textMuted,textAlign:"left"}}>Hour</th>
                {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=>(
                  <th key={d} style={{padding:"4px 10px",color:DS.textMuted}}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hourly.map(h=>(
                <tr key={h.hour}>
                  <td style={{padding:"3px 8px",color:DS.textMuted}}>{h.hour}</td>
                  {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d,di)=>{
                    const r=seed(h.h*10+di); const val=h.spend*(0.6+r()*0.8);
                    const maxVal=500; const intensity=Math.min(1,val/maxVal);
                    const isWknd=di>=5;
                    const bg=intensity<0.2?DS.bgSurface:intensity<0.5?`${DS.blue}40`:intensity<0.75?`${DS.blue}80`:DS.blue;
                    return(
                      <td key={d} title={`${h.hour} ${d}: $${val.toFixed(0)}`}
                        style={{padding:"3px 10px",background:bg,borderRadius:2,
                          color:intensity>0.5?DS.text:DS.textMuted,textAlign:"center",cursor:"default",
                          opacity:isWknd?0.7:1}}>
                        {intensity>0.3?`$${(val/100).toFixed(0)}c`:"·"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GEO & SEARCH TERMS TAB
═══════════════════════════════════════════════════════════════ */
function GeoSearchTab({geo,searchTerms}) {
  const geoCols=[
    {key:"state",       label:"State",     bold:true,render:r=><span style={{color:DS.text,fontWeight:600}}>{r.state}</span>},
    {key:"spend",       label:"Spend",     right:true,mono:true,render:r=>F.$(r.spend)},
    {key:"clicks",      label:"Clicks",    right:true,mono:true,render:r=>F.n(r.clicks)},
    {key:"conversions", label:"Conv.",     right:true,mono:true},
    {key:"cvr",         label:"CVR",       right:true,mono:true,render:r=>F.pct(r.cvr)},
    {key:"cpa",         label:"CPA",       right:true,mono:true,render:r=>F.$(r.cpa)},
    {key:"spendShare",  label:"Spend %",   right:true,
      render:r=>{const tot=geo.reduce((s,g)=>s+g.spend,0);const pct=tot>0?(r.spend/tot)*100:0;
        return <><span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10}}>{pct.toFixed(1)}%</span><Bar2 value={pct} color={DS.blue}/></>;}},
  ];
  const stCols=[
    {key:"term",         label:"Search Term",  bold:true,render:r=><span style={{color:DS.text,fontWeight:500}}>{r.term}</span>},
    {key:"matchedKeyword",label:"Matched KW",  render:r=><span style={{color:DS.textSub,fontSize:10}}>{r.matchedKeyword}</span>},
    {key:"clicks",       label:"Clicks",       right:true,mono:true,render:r=>F.n(r.clicks)},
    {key:"impressions",  label:"Impr.",         right:true,mono:true,render:r=>F.n(r.impressions)},
    {key:"cost",         label:"Cost",          right:true,mono:true,render:r=>F.$(r.cost)},
    {key:"conversions",  label:"Conv.",         right:true,mono:true},
    {key:"convRate",     label:"CVR",           right:true,mono:true,render:r=>F.pct(r.convRate)},
    {key:"cpc",          label:"CPC",           right:true,mono:true,render:r=>F.$(r.cpc)},
    {key:"added",        label:"Action",
      render:r=><Tag color={r.added==="Added"?DS.green:r.added==="Excluded"?DS.red:DS.textMuted}>{r.added}</Tag>},
  ];

  const maxSpend=Math.max(...geo.map(g=>g.spend));

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <ChartCard title="Spend by state" sub="Top 10 states by ad spend" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={geo} layout="vertical" margin={{top:0,right:10,bottom:0,left:100}}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border} horizontal={false}/>
              <XAxis type="number" tick={{fontSize:8,fill:DS.textMuted}} tickFormatter={v=>F.$(v)}/>
              <YAxis dataKey="state" type="category" width={98} tick={{fontSize:9,fill:DS.textSub}}/>
              <Tooltip content={<TT fmts={{Spend:F.$,Conversions:v=>v}}/>}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              <Bar dataKey="spend" fill={DS.blue} fillOpacity={0.8} radius={[0,3,3,0]} name="Spend" barSize={10}/>
              <Bar dataKey="conversions" fill={DS.green} fillOpacity={0.8} radius={[0,3,3,0]} name="Conversions" barSize={10}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="CVR vs CPA by state" sub="Efficiency scatter" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{top:10,right:20,bottom:20,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={DS.border}/>
              <XAxis dataKey="cpa" name="CPA" tick={{fontSize:8,fill:DS.textMuted}} tickFormatter={v=>F.$(v)}
                label={{value:"CPA",position:"insideBottom",offset:-8,fontSize:9,fill:DS.textMuted}}/>
              <YAxis dataKey="cvr" name="CVR" tick={{fontSize:8,fill:DS.textMuted}} tickFormatter={v=>`${v}%`}
                label={{value:"CVR%",angle:-90,position:"insideLeft",fontSize:9,fill:DS.textMuted}}/>
              <ZAxis dataKey="spend" range={[40,400]} name="Spend"/>
              <Tooltip content={({active,payload})=>{
                if(!active||!payload?.[0]) return null;
                const d=payload[0].payload;
                return(<div style={{background:DS.bgCard,border:`1px solid ${DS.borderHi}`,borderRadius:6,padding:"8px 12px",fontSize:10}}>
                  <p style={{fontWeight:700,color:DS.text}}>{d.state}</p>
                  <p style={{color:DS.textSub}}>CPA: {F.$(d.cpa)} · CVR: {d.cvr}%</p>
                  <p style={{color:DS.textSub}}>Spend: {F.$(d.spend)}</p>
                </div>);
              }}/>
              <Scatter data={geo} fill={DS.teal} fillOpacity={0.7}/>
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{background:DS.bgCard,border:`1px solid ${DS.border}`,borderRadius:8,padding:"16px 18px",marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:600,color:DS.text,marginBottom:12}}>Geographic breakdown — top states</div>
        <DataTable cols={geoCols} rows={geo}/>
      </div>

      <div style={{background:DS.bgCard,border:`1px solid ${DS.border}`,borderRadius:8,padding:"16px 18px"}}>
        <div style={{fontSize:12,fontWeight:600,color:DS.text,marginBottom:12}}>Search terms report — with action status</div>
        <DataTable cols={stCols} rows={[...searchTerms].sort((a,b)=>b.cost-a.cost)}/>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ROOT DASHBOARD
═══════════════════════════════════════════════════════════════ */
export default function GoogleAdsDashboard() {
  const allTrends       = useMemo(()=>genTrends(90),[]);
  const allCampaigns    = useMemo(()=>genCampaigns(),[]);
  const allKeywords     = useMemo(()=>genKeywords(),[]);
  const hourly          = useMemo(()=>genHourly(),[]);
  const dayOfWeek       = useMemo(()=>genDayOfWeek(),[]);
  const searchTerms     = useMemo(()=>genSearchTerms(),[]);
  const geo             = useMemo(()=>genGeo(),[]);
  const auctionInsights = useMemo(()=>genAuctionInsights(),[]);

  const [tab, setTab] = useState("Overview");
  const [f, setF] = useState({
    period:30, network:"All", matchType:"All", status:"All", schedule:"All",
    budgetUtil:"All", efficiency:"All", label:"All",
    sortBy:"cost", minSpend:0, targetCPA:0, targetROAS:0,
  });

  const filteredTrends = useMemo(()=>{
    if(f.period===0) return allTrends;
    const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-f.period);
    return allTrends.filter(r=>new Date(r.date)>=cutoff);
  },[allTrends,f.period]);

  const filteredCamps = useMemo(()=>{
    let d=[...allCampaigns];
    if(f.network!=="All") d=d.filter(c=>c.network===f.network||c.type===f.network);
    if(f.status!=="All")  d=d.filter(c=>c.status===f.status);
    if(f.label!=="All")   d=d.filter(c=>c.labels.includes(f.label));
    if(f.schedule==="Weekday") d=d.filter(c=>c.type!=="Video");
    d=d.filter(c=>c.cost>=f.minSpend);
    if(f.budgetUtil==="Under 70%") d=d.filter(c=>c.budgetUtil<70);
    else if(f.budgetUtil==="70–90%") d=d.filter(c=>c.budgetUtil>=70&&c.budgetUtil<=90);
    else if(f.budgetUtil==="Over 90%") d=d.filter(c=>c.budgetUtil>90);
    if(f.efficiency!=="All") d=d.filter(c=>efficiencyOf(c)===f.efficiency);
    d.sort((a,b)=>{
      if(f.sortBy==="cpa"){ const ca=a.conversions>0?a.cost/a.conversions:Infinity; const cb=b.conversions>0?b.cost/b.conversions:Infinity; return ca-cb; }
      if(f.sortBy==="roas"){ return (b.cost>0?b.revenue/b.cost:0)-(a.cost>0?a.revenue/a.cost:0); }
      if(f.sortBy==="ctr"){ return (b.impressions>0?b.clicks/b.impressions:0)-(a.impressions>0?a.clicks/a.impressions:0); }
      return b[f.sortBy]-a[f.sortBy];
    });
    return d;
  },[allCampaigns,f]);

  const filteredKeywords = useMemo(()=>{
    let d=[...allKeywords];
    if(f.matchType!=="All") d=d.filter(k=>k.matchType===f.matchType);
    if(f.status!=="All") d=d.filter(k=>k.status===f.status);
    return d;
  },[allKeywords,f]);

  const kpis = useMemo(()=>computeKPIs(filteredCamps,filteredTrends,f.targetCPA,f.targetROAS),
    [filteredCamps,filteredTrends,f.targetCPA,f.targetROAS]);

  const fontLink = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@400;600;700;800&display=swap');`;

  return (
    <>
      <style>{`
        ${fontLink}
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${DS.bg};font-family:'Syne',system-ui,sans-serif;color:${DS.text};}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:${DS.bgCard};}
        ::-webkit-scrollbar-thumb{background:${DS.border};border-radius:3px;}
        input[type=range]{-webkit-appearance:none;height:3px;border-radius:3px;background:${DS.border};}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;cursor:pointer;}
        select option{background:${DS.bgCard};color:${DS.text};}
      `}</style>

      <div style={{background:DS.bg,minHeight:"100vh",padding:"20px 24px"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:18}}>
          <div>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.16em",color:DS.textMuted,
              textTransform:"uppercase",fontFamily:"'IBM Plex Mono',monospace",marginBottom:4}}>
              PERFORMANCE INTELLIGENCE PLATFORM
            </div>
            <h1 style={{fontSize:26,fontWeight:800,color:DS.text,letterSpacing:"-0.03em",fontFamily:"'Syne',sans-serif",lineHeight:1}}>
              Google Ads Analytics
            </h1>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:DS.textSub,
              background:DS.bgCard,border:`1px solid ${DS.border}`,padding:"6px 12px",borderRadius:6}}>
              {filteredCamps.length} campaigns · {filteredTrends.length} days
            </div>
            <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:DS.green,
              background:`${DS.green}18`,border:`1px solid ${DS.green}44`,padding:"6px 12px",borderRadius:6}}>
              ● LIVE (mock data)
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <FilterBar f={f} setF={setF} campaigns={allCampaigns}/>

        {/* Tabs */}
        <TabBar tab={tab} setTab={setTab}/>

        {/* Tab Content */}
        {tab==="Overview"    && <OverviewTab    kpis={kpis} trends={filteredTrends} filteredCamps={filteredCamps}/>}
        {tab==="Campaigns"   && <CampaignsTab   camps={filteredCamps}/>}
        {tab==="Keywords"    && <KeywordsTab     keywords={filteredKeywords}/>}
        {tab==="Auction"     && <AuctionTab      auctionInsights={auctionInsights} camps={filteredCamps}/>}
        {tab==="Scheduling"  && <SchedulingTab   hourly={hourly} dayOfWeek={dayOfWeek}/>}
        {tab==="Geo & Search Terms" && <GeoSearchTab geo={geo} searchTerms={searchTerms}/>}
      </div>
    </>
  );
}