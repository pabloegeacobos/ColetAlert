# Genera btc-alertas.html (un solo archivo) a partir de panel.src.html + engine.js + elliott.js
src = open('panel.src.html', encoding='utf-8').read()
eng = open('engine.js', encoding='utf-8').read()
ew = open('elliott.js', encoding='utf-8').read()
open('btc-alertas.html', 'w', encoding='utf-8').write(src.replace('/*__ENGINE__*/', eng).replace('/*__ELLIOTT__*/', ew))
print('btc-alertas.html generado')
