var SK=[
 {id:'novato',n:'Novato',r:'comum',c:0,a:{h:1,hc:'#3b2a1a',oc:'#2574a9',skin:'#f1c27d'}},
 {id:'cortesa',n:'Cortesã',r:'comum',c:0,a:{h:2,hc:'#6b2d1a',oc:'#a8392b',skin:'#e0ac69'}},
 {id:'mercador',n:'Mercador',r:'raro',c:100,a:{h:1,hc:'#222222',oc:'#2a8a4f',skin:'#8d5524',x:'hat'}},
 {id:'pirata',n:'Pirata',r:'raro',c:120,a:{h:3,hc:'#111111',oc:'#34404c',skin:'#c68642',x:'patch'}},
 {id:'espiao',n:'Espião',r:'épico',c:250,a:{h:0,oc:'#222222',skin:'#f1c27d',x:'mask'}},
 {id:'duque',n:'Duque Dourado',r:'épico',c:300,a:{h:2,hc:'#d9d9d9',oc:'#7b3fa0',skin:'#ffdbac',x:'crown'}},
 {id:'rei',n:'Rei do Golpe',r:'lendário',c:600,a:{h:1,hc:'#f1c40f',oc:'#a8392b',skin:'#e0ac69',x:'crown'}}
];
var MS=[
 {id:'m1',t:'Jogar 1 partida',k:'games',n:1,p:20},
 {id:'m2',t:'Vencer 1 partida',k:'wins',n:1,p:50},
 {id:'m3',t:'Jogar 5 partidas',k:'games',n:5,p:60},
 {id:'m4',t:'Vencer 3 partidas',k:'wins',n:3,p:120},
 {id:'m5',t:'Acertar 3 desafios',k:'chal',n:3,p:40}
];
if(typeof module!=='undefined')module.exports={SK:SK,MS:MS};
