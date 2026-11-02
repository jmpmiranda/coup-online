var SK=[
 {id:'novato',n:'Novato',r:'comum',c:0,a:{h:1,hc:'#3b2a1a',oc:'#2574a9',skin:'#f5cfa7',e:'#4a6a8a',b:0,cl:0}},
 {id:'cortesa',n:'Cortesã',r:'comum',c:0,a:{h:2,hc:'#6b4423',oc:'#a8392b',skin:'#e8b98a',e:'#6b4a2a',b:0,cl:1}},
 {id:'mercador',n:'Mercador',r:'raro',c:100,a:{h:1,hc:'#222222',oc:'#2a8a4f',skin:'#8a5530',e:'#2a2a2a',b:1,cl:2,x:'hat'}},
 {id:'pirata',n:'Pirata',r:'raro',c:120,a:{h:5,hc:'#111111',oc:'#34404c',skin:'#d09a68',e:'#2a2a2a',b:2,cl:0,x:'patch'}},
 {id:'espiao',n:'Espião',r:'épico',c:250,a:{h:1,hc:'#111111',oc:'#111111',skin:'#f5cfa7',e:'#7a8a99',b:3,cl:2,x:'mask'}},
 {id:'duque',n:'Duque Dourado',r:'épico',c:300,a:{h:2,hc:'#e8e8e8',oc:'#7b3fa0',skin:'#fde0c8',e:'#7a8a99',b:2,cl:3,x:'crown'}},
 {id:'rei',n:'Rei do Golpe',r:'lendário',c:600,a:{h:1,hc:'#d9b44a',oc:'#a8392b',skin:'#e8b98a',e:'#3b6b3b',b:2,cl:3,x:'crown'}},
 {id:'napoleao',n:'Napoleão',r:'mítico',c:1500,a:{sp:'napoleao'}},
 {id:'lupin',n:'Arsène Lupin',r:'exclusivo',c:0,owner:true,a:{sp:'lupin'}}
];
var MS=[
 {id:'m1',t:'Jogar 1 partida',k:'games',n:1,p:20},
 {id:'m2',t:'Vencer 1 partida',k:'wins',n:1,p:50},
 {id:'m3',t:'Jogar 5 partidas',k:'games',n:5,p:60},
 {id:'m4',t:'Vencer 3 partidas',k:'wins',n:3,p:120},
 {id:'m5',t:'Acertar 3 desafios',k:'chal',n:3,p:40}
];
if(typeof module!=='undefined')module.exports={SK:SK,MS:MS};
