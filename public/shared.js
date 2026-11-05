var XPL=100;
var SK=[
 {id:'novato',n:'Novato',r:'comum',c:0,a:{h:1,hc:'#3b2a1a',oc:'#2574a9',skin:'#f5cfa7',e:'#4a6a8a',b:0,cl:0}},
 {id:'cortesa',n:'Cortesã',r:'comum',c:0,a:{h:2,hc:'#6b4423',oc:'#a8392b',skin:'#e8b98a',e:'#6b4a2a',b:0,cl:1}},
 {id:'cowboy',n:'Cowboy',r:'raro',c:60,a:{h:1,hc:'#6b4423',oc:'#a8392b',skin:'#d09a68',e:'#6b4a2a',b:1,cl:1,x:'cowboy'}},
 {id:'mercador',n:'Mercador',r:'raro',c:60,a:{h:1,hc:'#222222',oc:'#2a8a4f',skin:'#8a5530',e:'#2a2a2a',b:1,cl:2,x:'hat'}},
 {id:'pirata',n:'Pirata',r:'raro',c:60,a:{h:5,hc:'#111111',oc:'#34404c',skin:'#d09a68',e:'#2a2a2a',b:2,cl:0,x:'patch'}},
 {id:'espiao',n:'Espião',r:'épico',c:150,a:{h:1,hc:'#111111',oc:'#111111',skin:'#f5cfa7',e:'#7a8a99',b:3,cl:2,x:'mask'}},
 {id:'duque',n:'Duque Dourado',r:'épico',c:150,a:{h:2,hc:'#e8e8e8',oc:'#7b3fa0',skin:'#fde0c8',e:'#7a8a99',b:2,cl:3,x:'crown'}},
 {id:'rainha',n:'Rainha',r:'épico',c:150,a:{h:2,hc:'#2a1510',oc:'#a8392b',skin:'#f5cfa7',e:'#6b4a2a',b:0,cl:3,x:'crown'}},
 {id:'cavaleiro',n:'Cavaleiro',r:'épico',c:150,a:{sp:'cavaleiro'}},
 {id:'ninja',n:'Ninja',r:'épico',c:150,a:{sp:'ninja'}},
 {id:'rei',n:'Rei do Golpe',r:'lendário',c:400,a:{h:1,hc:'#d9b44a',oc:'#a8392b',skin:'#e8b98a',e:'#3b6b3b',b:2,cl:3,x:'crown'}},
 {id:'mago',n:'Mago',r:'lendário',c:400,a:{sp:'mago'}},
 {id:'vampiro',n:'Vampiro',r:'lendário',c:400,a:{sp:'vampiro'}},
 {id:'napoleao',n:'Napoleão',r:'mítico',c:1000,a:{sp:'napoleao'}},
 {id:'lupin',n:'Arsène Lupin',r:'exclusivo',c:0,owner:true,a:{sp:'lupin'}}
];
var PASS=[
 {l:1,t:'coins',n:50},{l:2,t:'coins',n:50},{l:3,t:'raffle',n:1},{l:4,t:'coins',n:80},{l:5,t:'gems',n:5},
 {l:6,t:'coins',n:80},{l:7,t:'raffle',n:1},{l:8,t:'coins',n:100},{l:9,t:'gems',n:5},{l:10,t:'raffle',n:1},
 {l:11,t:'coins',n:120},{l:12,t:'gems',n:8},{l:13,t:'coins',n:120},{l:14,t:'raffle',n:1},{l:15,t:'gems',n:10},
 {l:16,t:'coins',n:150},{l:17,t:'raffle',n:1},{l:18,t:'gems',n:10},{l:19,t:'coins',n:200},{l:20,t:'raffle',n:2}
];
var MV={clap:'Bater palmas',dance:'Dançar',shrug:'Dar de ombros',wave:'Acenar',bow:'Reverência',nod:'Dizer sim com a cabeça',no:'Dizer não com a cabeça',jump:'Pular',shake:'Tremer',spin:'Girar'};
var EM=[
 {id:'palmas',n:'Palmas',txt:'Boa jogada!',mv:'clap',c:0},
 {id:'pular',n:'Pulinho',mv:'jump',c:0},
 {id:'risada',n:'Risada',txt:'Haha, essa foi boa!',mv:'shrug',c:60},
 {id:'sorte',n:'Que sorte!',txt:'Que sorte a minha!',mv:'jump',c:60},
 {id:'confete',n:'Confete',txt:'Vitória à vista!',mv:'dance',c:120},
 {id:'sim',n:'Dizer sim',mv:'nod',c:40},
 {id:'nao',n:'Dizer não',mv:'no',c:40},
 {id:'aceno',n:'Acenar',mv:'wave',c:60},
 {id:'ombros',n:'Dar de ombros',mv:'shrug',c:80},
 {id:'tremer',n:'Tremer de medo',mv:'shake',c:80},
 {id:'reverencia',n:'Reverência',mv:'bow',c:100},
 {id:'aplauso',n:'Aplauso',mv:'clap',c:100},
 {id:'girar',n:'Girar',mv:'spin',c:120},
 {id:'danca',n:'Dancinha',mv:'dance',c:200}
];
var DM=[
 {id:'d1',t:'Jogar 2 partidas hoje',k:'games',n:2,p:40},
 {id:'d2',t:'Vencer 1 partida hoje',k:'wins',n:1,p:60},
 {id:'d3',t:'Acertar 1 desafio hoje',k:'chal',n:1,p:30},
 {id:'d4',t:'Bloquear 1 vez hoje',k:'blk',n:1,p:30}
];
var MS=[
 {id:'m1',t:'Jogar a primeira partida',k:'games',n:1,p:30},
 {id:'m2',t:'Vencer a primeira partida',k:'wins',n:1,p:60},
 {id:'m3',t:'Jogar 10 partidas',k:'games',n:10,p:100},
 {id:'m4',t:'Vencer 5 partidas',k:'wins',n:5,p:150},
 {id:'m5',t:'Acertar 5 desafios',k:'chal',n:5,p:80},
 {id:'m6',t:'Bloquear 5 vezes',k:'blk',n:5,p:60},
 {id:'m7',t:'Dar 5 golpes',k:'coup',n:5,p:60}
];
if(typeof module!=='undefined')module.exports={SK:SK,MS:MS,DM:DM,PASS:PASS,XPL:XPL,EM:EM,MV:MV};
