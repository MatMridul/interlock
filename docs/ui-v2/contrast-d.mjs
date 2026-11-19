// WCAG 2.x contrast for the comp-d tokens. Run: node docs/ui-v2/contrast-d.mjs
const lin=(c)=>{c/=255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4};
const rgb=(h)=>{const n=parseInt(h.slice(1),16);return [n>>16,(n>>8)&255,n&255]};
const lum=(h)=>{const [r,g,b]=rgb(h);return .2126*lin(r)+.7152*lin(g)+.0722*lin(b)};
const cr=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05)};
const blend=(f,b,a)=>"#"+rgb(f).map((v,i)=>Math.round(v*a+rgb(b)[i]*(1-a)).toString(16).padStart(2,"0")).join("");
const P=[
["silk #d4d8dc on panel #141618","#d4d8dc","#141618",4.5],["silk2 #9ba3aa on panel","#9ba3aa","#141618",4.5],
["silk on stage #101112 (state names, conduit labels)","#d4d8dc","#101112",4.5],["silk2 on stage (ledger, captions)","#9ba3aa","#101112",4.5],
["silk2 on terminal #090b0a","#9ba3aa","#090b0a",4.5],["console ink #c9d3cc on terminal","#c9d3cc","#090b0a",4.5],
["phosphor #5dff8c on terminal (ALLOWED lines)","#5dff8c","#090b0a",4.5],["red #ff5a4a on terminal (BLOCKED lines)","#ff5a4a","#090b0a",4.5],
["red on panel (canned replay, not live)","#ff5a4a","#141618",4.5],["silk2 on tape #070908","#9ba3aa","#070908",4.5],
["phosphor on tape (L(M) check, readout)","#5dff8c","#070908",4.5],["red on tape","#ff5a4a","#070908",4.5],
["VOID symbol #ffb5ac on stamp #2a0d0b","#ffb5ac","#2a0d0b",4.5],["VOID word red on stamp #2a0d0b","#ff5a4a","#2a0d0b",4.5],
["tape cell text #e6e9ec on #15191c","#e6e9ec","#15191c",4.5],["tape cell sub #9ba3aa on #15191c","#9ba3aa","#15191c",4.5],
["odometer cream #ece9dc on drum mid #26292d (worst)","#ece9dc","#26292d",4.5],["blocked digits #ff9d92 on drum mid","#ff9d92","#26292d",4.5],
["white on BLOCKED plate #3a0f0c","#ffffff","#3a0f0c",4.5],["black on red toast kind chip","#000000","#ff5a4a",4.5],["black on silk toast chip","#000000","#d4d8dc",4.5],
["ledger lit row #031a0b on phosphor","#031a0b","#5dff8c",4.5],["silk on keypad key top #3a4046","#d4d8dc","#3a4046",4.5],
["amber key #ffb000 on key plate #0f1113 (graphic)","#ffb000","#0f1113",3],["amber text #ffd27a on #3a2a05 (packet)","#ffd27a","#3a2a05",4.5],
["silk on smoked cover (approx #3b3f45)","#ffffff","#3b3f45",4.5],["silk2 on key plate #141618 (11px status)","#9ba3aa","#141618",4.5],
["phosphor lamp #5dff8c vs panel (graphic)","#5dff8c","#141618",3],["silk ring #8a9299 on stage (graphic)","#8a9299","#101112",3],
["disabled keypad (opacity .42 silk on #23272b): intentional, exempt",blend("#d4d8dc","#23272b",.42),"#23272b",0],
];
let bad=0;for(const [l,f,b,need] of P){const r=cr(f,b),ok=r>=need;if(!ok)bad++;console.log(`${ok?"PASS":"FAIL"} ${r.toFixed(2).padStart(5)}:1 (need ${need})  ${l}`)}
console.log(bad?bad+" FAILING":"all pass");
