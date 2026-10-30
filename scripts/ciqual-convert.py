"""Convertit la table CIQUAL 2020 (XML de l'ANSES) en JSON compact pour l'app.

Source : https://ciqual.anses.fr (Table Ciqual 2020, Licence Ouverte / Etalab).
Usage : python -I scripts/ciqual-convert.py <dossier_xml_extrait> public/data/ciqual-2020.json

Valeurs pour 100 g. « - » (non mesuré) → null ; « traces » → 0.
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

# Constituants retenus (code CIQUAL → nom du champ).
CONST = {
    '328': 'kcal',
    '333': 'kcalJones',  # repli : énergie N × Jones avec fibres
    '25000': 'protein',  # N × facteur de Jones (référence CIQUAL)
    '25003': 'protein625',  # repli si le précédent manque
    '31000': 'carbs',
    '40000': 'fat',
    '32000': 'sugars',
    '34100': 'fiber',
    '10004': 'salt',
    '10110': 'sodium',
    '40302': 'satFat',
    '10260': 'iron',
    '10200': 'calcium',
    '10190': 'potassium',
    '52100': 'vitD',
    '56600': 'b12',
}
FIELDS = ['code', 'name', 'group', 'kcal', 'protein', 'carbs', 'fat', 'sugars', 'fiber', 'salt', 'satFat', 'iron', 'calcium', 'potassium', 'vitD', 'b12']


def read(path: Path) -> ET.Element:
    # Fichiers en windows-1252, avec quelques « < » et « & » non échappés dans les noms (ex. « <1° alc. »).
    text = path.read_bytes().decode('windows-1252').replace('encoding="windows-1252"', '')
    text = re.sub(r'<(?![A-Za-z_/?!])', '&lt;', text)
    text = re.sub(r'&(?!(?:[A-Za-z]+|#\d+);)', '&amp;', text)
    return ET.fromstring(text)


def value(text: str | None):
    s = (text or '').strip()
    if s in ('', '-'):
        return None
    if s == 'traces':
        return 0
    s = s.replace(',', '.')
    s = re.sub(r'^<\s*', '', s)
    try:
        return float(s)
    except ValueError:
        return None


def main(src: str, out: str):
    d = Path(src)
    alim = read(next(d.glob('alim_2*.xml')))
    grp = read(next(d.glob('alim_grp_*.xml')))
    groups = {}
    for g in grp.iter('ALIM_GRP'):
        groups[g.findtext('alim_grp_code').strip()] = g.findtext('alim_grp_nom_fr').strip()
    foods = {}
    for a in alim.iter('ALIM'):
        code = a.findtext('alim_code').strip()
        foods[code] = {'code': int(code), 'name': ' '.join(a.findtext('alim_nom_fr').split()), 'group': a.findtext('alim_grp_code').strip()}
    compo = read(next(d.glob('compo_*.xml')))
    for c in compo.iter('COMPO'):
        field = CONST.get(c.findtext('const_code').strip())
        if not field:
            continue
        f = foods.get(c.findtext('alim_code').strip())
        if f is not None:
            f[field] = value(c.findtext('teneur'))
    rows = []
    for f in foods.values():
        if f.get('kcal') is None:
            f['kcal'] = f.get('kcalJones')
        if f.get('protein') is None:
            f['protein'] = f.get('protein625')
        if f.get('salt') is None and f.get('sodium') is not None:
            f['salt'] = round(f['sodium'] * 2.5 / 1000, 3)
        # Sans énergie, l'aliment est inutilisable dans un journal.
        if f.get('kcal') is None:
            continue
        row = []
        for k in FIELDS:
            v = f.get(k)
            if isinstance(v, float):
                v = round(v, 3 if k in ('vitD', 'b12', 'salt') else 2)
                if v == int(v):
                    v = int(v)
            row.append(v)
        rows.append(row)
    rows.sort(key=lambda r: r[1])
    data = {
        'source': 'Table de composition nutritionnelle des aliments Ciqual 2020, ANSES — Licence Ouverte / Etalab',
        'fields': FIELDS,
        'groups': groups,
        'foods': rows,
    }
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(rows)} aliments écrits dans {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
