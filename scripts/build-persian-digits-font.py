"""Build public/fonts/persian-digits-wght-normal.woff2.

Subsets Vazirmatn (OFL, see public/fonts/Vazirmatn-LICENSE.txt) down to its Persian digit
glyphs and maps the ASCII digits 0-9 onto them, keeping the variable weight axis. globals.css
puts this face first in the font stack with unicode-range U+0030-0039, so every number renders
in Persian while the actual text and stored data keep Latin digits.

Usage: pip install fonttools brotli && python scripts/build-persian-digits-font.py
"""

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

SOURCE = 'public/fonts/vazirmatn-arabic-wght-normal.woff2'
OUTPUT = 'public/fonts/persian-digits-wght-normal.woff2'
FAMILY = 'Vardast Persian Digits'
PERSIAN_DIGITS = range(0x06F0, 0x06FA)

font = TTFont(SOURCE)
options = Options()
options.layout_features = []
options.name_IDs = ['*']
options.notdef_outline = True
subsetter = Subsetter(options)
subsetter.populate(unicodes=PERSIAN_DIGITS)
subsetter.subset(font)

for table in font['cmap'].tables:
    if table.isUnicode():
        for offset, code in enumerate(PERSIAN_DIGITS):
            table.cmap[0x30 + offset] = table.cmap[code]

name = font['name']
for record in list(name.names):
    if record.nameID in (1, 4, 16, 21):
        name.setName(FAMILY, record.nameID, record.platformID, record.platEncID, record.langID)
    elif record.nameID in (3, 6, 20):
        name.setName(FAMILY.replace(' ', ''), record.nameID, record.platformID, record.platEncID, record.langID)

font.flavor = 'woff2'
font.save(OUTPUT)
print(f'Wrote {OUTPUT}')
