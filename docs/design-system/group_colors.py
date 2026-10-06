from pathlib import Path
import json,re,math,colorsys
from color_math import rgb, hexval
ROOT=Path(__file__).resolve().parents[2]
j=json.load(open(ROOT/'docs/design-system/inventory.json'));rows=j['categories']['colors'];parsed=[];unresolved=[]
for r in rows:
 v=r['value']
 try:
  if v.startswith('%23'):v='#'+v[3:]
  if re.fullmatch('#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?',v):c=rgb(v)
  elif v.startswith('oklch(') and 'var(' not in v and 'from ' not in v and '/' not in v:c=rgb(v)
  elif re.fullmatch(r'(rgb|rgba|hsl|hsla)\([\d.,% /]+\)',v):
   typ=v[:v.index('(')];a=re.findall(r'[\d.]+%?',v)
   if len(a)>3:raise ValueError('alpha')
   if typ.startswith('hsl'):c=list(colorsys.hls_to_rgb(float(a[0])/360,float(a[2].rstrip('%'))/100,float(a[1].rstrip('%'))/100))
   else:c=[float(x.rstrip('%'))/(100 if '%' in x else 255) for x in a]
  else:raise ValueError()
  parsed.append((r,c))
 except (ValueError,IndexError):unresolved.append(r)
groups=[]
for r,c in sorted(parsed,key=lambda x:-x[0]['count']):
 for g in groups:
  if math.sqrt(sum(((a-b)*255)**2 for a,b in zip(c,g[0][1])))<=24:
   g.append((r,c));break
 else:groups.append([(r,c)])
lines=['# Color proximity groups','','These groups assist consolidation; they are not evidence that every color has the same purpose. Counts and all locations remain in [audit-colors.md](audit-colors.md). Opaque hex, RGB/HSL and OKLCH literals are converted to clipped sRGB. Most-used spelling anchors each group; other values must be within Euclidean distance 24 on encoded RGB channels (0–255) of that anchor. This is a simple reproducible similarity heuristic, not a perceptual ΔE or contrast test. No transitive chaining is used. Alpha, color-mix, relative colors and variable references remain separate pending host-surface resolution. SVG/brand assets and theme-preview data are included in raw counts, so the most-used spelling alone cannot choose the runtime semantic role.','','| Group anchor | Competing literal values (occurrences) | Locations |','| --- | --- | --- |']
for g in groups:
 if len(g)<2:continue
 literals='; '.join(f'`{r["value"]}` ({r["count"]})' for r,c in g)
 paths='; '.join('`'+p+'`' for p in sorted(set(l['path'] for r,c in g for l in r['locations'])))
 lines.append(f'| `{g[0][0]["value"]}` / `{hexval(g[0][0]["value"]) if g[0][0]["value"].startswith(("#","oklch")) else "sRGB"}` | {literals} | {paths} |')
lines+=['','## Consolidation decisions','','- Deep neutral surfaces: keep the runtime background zinc-950, sidebar zinc-900, muted/accent zinc-800 and existing #101011 container. Do not flatten intentionally different surface levels. Named-theme grays are retained under D1.','- Whites #fff/#ffffff normalize in the source; text-foreground remains the default on dark surfaces. Brand assets are exempt from changing their white fills.','- Metadata grays #8f9299/#95a2b3/#8a8f98 and palette text-zinc classes consolidate to muted-foreground when they are UI text, not when they represent chart/user categories.','- Existing lavender/blues #6771c5/#5e6ad2/#575bc7 are competing domain/accent colors. Keep meanings separate from the blue primary brand; D2 approves blue primary action fill; domain color meanings stay distinct.','- Red/yellow/green status colors consolidate by success/warning/error meaning to the existing high-use #4cb782 and #f2c94c anchors plus readable error text. Do not recolor third-party logos or user-defined labels.','','## Unresolved color expressions','','Opacity and nested variable functions require a rendered/composited host; [inventory.json](inventory.json) lists all '+str(len(unresolved))+' ungrouped expression rows. Single-member groups also remain in the complete color inventory. Examples include registry relative OKLCH, custom theme generation and inline data colors. Do not merge these by literal string similarity.']
(ROOT/'docs/design-system/audit-color-groups.md').write_text('\n'.join(lines)+'\n')
print(len(groups),'opaque groups',len(unresolved),'unresolved expressions')
