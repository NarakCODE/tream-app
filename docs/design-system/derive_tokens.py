from pathlib import Path
import math,re,difflib,json
root=Path(__file__).resolve().parents[2];out=root/'docs/design-system'
globalcss=(root/'apps/web/app/globals.css').read_text();theme=(root/'apps/web/node_modules/tailwindcss/theme.css').read_text()
from color_math import rgb, lum, ratio, hexval
palette={}
for family,source in [('gray','zinc'),('blue','blue')]:
 for n in ([50]+list(range(100,1000,100))+[950] if family=='gray' else range(100,1000,100)):
  palette[f'{family}-{n}']=re.search(r'--color-'+source+'-'+str(n)+r': ([^;]+);',theme).group(1)
roles={
 'background':('gray-950','Page canvas'), 'container':('#101011','Existing inset main surface'), 'card':('gray-950','Existing Card surface'), 'popover':('gray-950','Existing overlay content'), 'sidebar':('gray-900','Existing sidebar surface'), 'surface-raised':('gray-900','Raised groups'),
 'foreground':('gray-50','Body and headings'), 'card-foreground':('gray-50','Card text'), 'popover-foreground':('gray-50','Popover text'), 'sidebar-foreground':('gray-50','Sidebar text'), 'muted':('gray-800','Muted and disabled surfaces'), 'muted-foreground':('gray-400','Secondary/helper text'), 'text-disabled':('gray-500','Unavailable controls only'),
 'primary':('blue-700','Approved blue primary button'), 'primary-foreground':('gray-50','Approved light primary label'), 'secondary':('gray-800','Secondary button fill'), 'secondary-foreground':('gray-50','Secondary label'), 'accent':('gray-800','Hover and selected neutral surface; not brand blue'), 'accent-foreground':('gray-50','Hover/selected text'),
 'border':('gray-800','Decorative separators'), 'input':('gray-500','Proposed visible control boundary'), 'ring':('blue-400','Proposed opaque keyboard focus; requires class migration'),
 'brand':('blue-500','Primary brand mark, not small text on filled blue'), 'brand-text':('blue-400','Links on neutral dark surfaces'), 'brand-action':('blue-700','Approved blue action'), 'brand-action-hover':('blue-600','Approved blue hover'), 'brand-action-active':('blue-800','Approved blue press'), 'brand-action-foreground':('gray-50','Label on blue action'),
 'action-hover':('blue-600','Approved primary hover'), 'action-active':('blue-800','Approved primary pressed'),
 'destructive':('red-900','Existing destructive fill'), 'destructive-foreground':('gray-50','Fix error foreground mismatch for filled action'), 'destructive-hover':('red-800','Proposed explicit hover replaces opacity'), 'destructive-active':('red-950','Proposed explicit press'),
 'success':('#4cb782','Existing status green'), 'warning':('#f2c94c','Existing status yellow'), 'error':('red-400','Readable error text; replaces inconsistent red-500/foreground fill usage'), 'info':('blue-400','Information text/icon'), 'status-surface':('gray-800','Default status badge fill'),
 'sidebar-primary':('blue-700','Existing dark sidebar brand'), 'sidebar-primary-foreground':('gray-50','Sidebar blue label'), 'sidebar-accent':('gray-800','Sidebar hover/active'), 'sidebar-accent-foreground':('gray-50','Sidebar hovered text'), 'sidebar-border':('gray-800','Sidebar separator'), 'sidebar-ring':('blue-400','Sidebar keyboard focus'),
}
for name in ('red-400','red-700','red-800','red-900','red-950'):
 palette[name]=re.search(r'--color-'+name+r': ([^;]+);',theme).group(1)
def val(name):
 x=roles[name][0];return palette.get(x,x)
# build one source, preserving all current non-reference themes until D1 is resolved
start=globalcss.index(':root {');end=globalcss.index('@theme inline {');variants=globalcss.index("[data-app-theme='pure-light']")
blocks=globalcss[start:end]+globalcss[variants:]
primitive='/* PROPOSAL ONLY. Retain themes; blue primary; compact desktop / 44px touch. */\n:root {\n'+''.join(f'  --{k}: {v};\n' for k,v in palette.items())
space={0:0,1:.25,'1-5':.375,2:.5,'2-5':.625,3:.75,4:1,6:1.5,8:2,10:2.5}
primitive+=''.join(f'  --space-{k}: {v}rem;\n' for k,v in space.items())
primitive+='  --target-min: 1.5rem; --target-touch: 2.75rem; --control-height: 2.25rem; --control-height-compact: 2rem;\n'
primitive+='  --radius-none: 0; --radius-xs: .125rem; --radius-checkbox: .25rem; --radius-pill: 9999px;\n'
primitive+='  --elevation-0: none;\n  --elevation-1: 0 1px 2px 0 rgb(0 0 0 / .05);\n  --elevation-2: 0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1);\n  --elevation-3: 0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1);\n'
primitive+='  --layer-base: 0; --layer-sticky: 10; --layer-panel: 40; --layer-overlay: 50; --layer-popover: 60; --layer-toast: 70; --layer-tooltip: 80;\n'
for role,size,weight,line in [('caption',.75,400,1),('label',.75,500,1),('body',.875,400,1.25),('control',.875,500,1.25),('reading',1,400,1.5),('h3',1.125,600,1.75),('h2',1.25,500,1.75),('h1',1.5,500,2)]:
 primitive+=f'  --type-{role}-size: {size}rem; --type-{role}-weight: {weight}; --type-{role}-line: {line}rem;\n'
primitive+='}\n\n'
# replace reference dark block only; preserve charts/hairline and named themes
match=re.search(r'\.dark \{(.*?)\n\}',blocks,re.S);dark=match.group(1)
for k,(ref,use) in roles.items():
 v=f'var(--{ref})' if ref in palette else ref
 line=f'   --{k}: {v};'
 if re.search(r'--'+re.escape(k)+r':',dark):dark=re.sub(r'   --'+re.escape(k)+r':[^;]+;',line,dark)
 else:dark+='\n'+line
blocks=blocks[:match.start()]+'.dark {'+dark+'\n}'+blocks[match.end():]
bridges='\n@theme inline {\n'+''.join(f'  --color-{k}: var(--{k});\n' for k in roles if k not in ('background','container','card','popover','sidebar','foreground','card-foreground','popover-foreground','sidebar-foreground','muted','muted-foreground','primary','primary-foreground','secondary','secondary-foreground','accent','accent-foreground','border','input','ring','destructive','destructive-foreground','sidebar-primary','sidebar-primary-foreground','sidebar-accent','sidebar-accent-foreground','sidebar-border','sidebar-ring'))
bridges+='  --shadow-xs: var(--elevation-1); --shadow-md: var(--elevation-2); --shadow-lg: var(--elevation-3);\n}\n'
# Complete fixed-theme aliases, preserving existing theme surfaces and foregrounds.
shared={k:roles[k][0] for k in ('primary','primary-foreground','brand','brand-action','brand-action-hover','brand-action-active','brand-action-foreground','action-hover','action-active','destructive','destructive-foreground','destructive-hover','destructive-active')}
fixed_aliases={}
for selector,islight in [(':root',True),("[data-app-theme='pure-light']",True),('.dark',False),("[data-app-theme='magic-blue']",False),("[data-app-theme='classic-dark']",False)]:
 refs={**shared,'surface-raised':'var(--sidebar)','text-disabled':'gray-500','input':'gray-500','ring':'blue-700' if islight else 'blue-400','sidebar-ring':'blue-700' if islight else 'blue-400','brand-text':'blue-700' if islight else 'blue-400','success':'#087c54' if islight else '#4cb782','warning':'#9c6300' if islight else '#f2c94c','error':'red-700' if islight else 'red-400','info':'blue-700' if islight else 'blue-400','status-surface':'var(--secondary)'}
 if islight:refs['muted-foreground']='gray-600'
 if selector=="[data-app-theme='magic-blue']":refs['input']='gray-400'
 fixed_aliases[selector]=refs
blocks+='\n/* Fixed-theme role completion. Original preset surfaces stay above. */\n'
for selector,refs in fixed_aliases.items():
 blocks+=selector+' {\n'+''.join(f'  --{k}: '+(f'var(--{v})' if v in palette else v)+';\n' for k,v in refs.items())+'}\n'
proposal=primitive+blocks+bridges
(out/'tokens.proposed.css').write_text(proposal)
modified=globalcss[:start]+globalcss[end:variants]
modified=modified.replace("@import '@repo/ui/splash-screen.css';", "@import '@repo/ui/splash-screen.css';\n@import './styles/tokens.css';")
patch=''.join(difflib.unified_diff(globalcss.splitlines(True),modified.splitlines(True),fromfile='a/apps/web/app/globals.css',tofile='b/apps/web/app/globals.css'))
patch+=''.join(difflib.unified_diff([],proposal.splitlines(True),fromfile='/dev/null',tofile='b/apps/web/app/styles/tokens.css'))
(out/'tokens-proposal.patch').write_text(patch)
# approved pairs matrix: dark reference only; disabled are exempt, still measured
backgrounds=['container','background','surface-raised','accent','status-surface']
texts=['foreground','muted-foreground','text-disabled','brand-text','success','warning','error','info']
lines=['# DS-01 Color','','Status: proposed dark reference. D1/D2/D3 are resolved: retain all themes, blue primary actions, compact desktop targets and 44px touch targets. No application CSS has changed.','','## Provenance and primitive palette','','Keep the current cool zinc grays: do not substitute a new slate palette just because the product direction says “slate”. Use the blue family already supplied by the installed Tailwind v4 theme and used as blue utilities/sidebar tokens. Primitive colors may appear only in the token source; components use semantic roles. The product owner approved blue primary buttons; this deliberately changes the existing near-white action role.','','| Token | CSS value | sRGB approximation | Source / role |','| --- | --- | --- | --- |']
for k,v in palette.items():
 lines.append(f'| `--{k}` | `{v}` | `{hexval(v)}` | '+('Installed zinc scale; runtime background/sidebar/border/foreground already use these anchors' if k.startswith('gray') else 'Installed Tailwind scale; blue-700 already used by dark sidebar/chart-1' if k.startswith('blue') else 'Existing destructive family; expanded named states')+' |')
lines+=['','Gray 50/950 extend the requested 100–900 scale because current foreground/background use those endpoints. Removing them would change the existing look. `--container=#101011` remains a semantic surface exception because it is already the inset authenticated shell color. Blue 100–900 are inherited palette values, not generated interpolation. Only the observed anchors are claimed as existing runtime use.','','## Semantic roles','','| Token / utility | Reference dark value | Example usage |','| --- | --- | --- |']
for k,(ref,use) in roles.items():lines.append(f'| `--{k}` / '+('`text-'+k+'`' if ('foreground' in k or k in texts) else '`bg-'+k+'`' if k not in ('input','ring','border','sidebar-ring','sidebar-border') else '`'+('ring-' if 'ring' in k else 'border-')+k+'`')+f' | `{ref}` → `{val(k)}` | {use} |')
lines+=['','`--border` is a decorative separator. Required input boundaries use `--input` and cannot rely on the low-contrast decorative border alone. Focus uses `--ring` at full opacity with a 2px perimeter and 2px offset; existing `ring-ring/50` classes still need migration. Transparent ghost controls inherit their containing surface and use the neutral accent surface for hover/press. Selection uses accent plus foreground and a text/check indicator, not blue alone.','','## Permitted text/background combinations and contrast','','Computed using WCAG relative luminance from sRGB, converting OKLCH to sRGB and clipping out-of-gamut channels. Ratios use unrounded values for pass/fail; tables round display to two decimals. Hex approximations are informational; CSS values above are the source. This is token-pair calculation, not a claim of browser measurement. Card/popover reuse background, sidebar reuses surface-raised, secondary/muted/sidebar-accent reuse accent. The table therefore covers those aliases too. No other text/background pairing is approved without a new calculation.','','| Text token | Container #101011 | Background/card/popover | Raised/sidebar | Accent/secondary/muted | Status surface |','| --- | ---: | ---: | ---: | ---: | ---: |']
for t in texts:lines.append('| `--'+t+'` | '+' | '.join(f'{ratio(val(t),val(b)):.2f}:1'+(' (inactive only)' if t=='text-disabled' else (' FAIL' if ratio(val(t),val(b))<4.5 else '')) for b in backgrounds)+' |')
lines+=['','| Label token | Fill token / state | Contrast | Use |','| --- | --- | ---: | --- |']
for text,bg,note in [('primary-foreground','primary','Approved primary default'),('primary-foreground','action-hover','Approved blue hover'),('primary-foreground','action-active','Approved blue pressed'),('brand-action-foreground','brand-action','Approved blue default'),('brand-action-foreground','brand-action-hover','Approved blue hover'),('brand-action-foreground','brand-action-active','Approved blue press'),('destructive-foreground','destructive','Destructive default'),('destructive-foreground','destructive-hover','Destructive hover'),('destructive-foreground','destructive-active','Destructive pressed'),('text-disabled','muted','Disabled, contrast exemption; do not use for helper text')]:
 lines.append(f'| `--{text}` | `--{bg}` | {ratio(val(text),val(bg)):.2f}:1 | {note} |')
lines+=['','Disabled controls use text-disabled on muted without an additional opacity multiplier. Loading uses the enabled label/fill pair and a spinner with the same text color. Ghost/secondary focus does not change the label pair. Error fields use error text on their host neutral surface; do not place error text over destructive fill. Static badges have no hover/focus/active state; interactive status pickers inherit Button/Select state rules.','','## Non-text contrast and current failures','','| Pair | Calculated contrast | Decision |','| --- | ---: | --- |']
for a,b in [('ring','background'),('ring','accent'),('input','background'),('input','accent'),('border','background')]:lines.append(f'| `--{a}` / `--{b}` | {ratio(val(a),val(b)):.2f}:1 | '+('Decorative only; not a required component boundary' if a=='border' else 'Use for focus/boundary at full opacity')+' |')
currentring='oklch(0.442 0.017 285.786)';bg=val('background');mixed='#'+''.join(f'{round((a*.5+b*.5)*255):02x}' for a,b in zip(rgb(currentring),rgb(bg)))
lines += ['',f'Current default `.dark --ring` against background is {ratio(currentring,bg):.2f}:1; at existing 50% ring opacity, its sRGB-composited approximation is {ratio(mixed,bg):.2f}:1. This motivates the focus remediation; actual adjacent colors must still be checked in a browser.',f'Current default `--destructive-foreground` (red-500) on `--destructive` (red-900) is {ratio("oklch(0.637 0.237 25.331)","oklch(0.396 0.141 25.723)"):.2f}:1. Button/Badge currently override the foreground with text-white, so this is a token-contract failure, not a claim that all destructive buttons fail. The proposal pairs light foreground with the filled action and a separate readable error token for inline validation.','','## Theme and color-data limits','','D1 retains all themes. Existing preset surface/foreground declarations are extracted unchanged, then explicit semantic overrides map primary buttons to the approved blue family and complete new roles for each fixed theme. The additional matrices below calculate those preset pairs. Custom themes can generate arbitrary surface/accent values through `theme-applier.tsx`; no finite matrix certifies them. Replace the current brightness heuristic with pair validation and offer a reset to the reference theme. Custom generation must not overwrite the approved blue action mapping; keep editable surface/sidebar accent preferences and validate readable text/indicators.','','Keep external integration logos, user-owned label colors and chart-series identities out of blind brand-color replacement. Decorative/user color can remain data behind a reviewed color API; label text and required icons still use validated semantic roles. Domain colors (`#6771c5`, `#5e6ad2`, `#95a2b3`, etc.) should become separately named domain tokens after their meaning is established, not all become primary blue.','','## Acceptance rules','','- Normal text and placeholders require at least 4.5:1; large text at least 3:1. Inactive controls are exempt, but metadata is not disabled text. See [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).','- Required control boundaries and focus indicators require at least 3:1 against adjacent colors under this system. See [WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).','- Set status with label plus icon/shape. Color alone cannot distinguish success/warning/error/info.','- No arbitrary color, literal hex/RGB/HSL/OKLCH or palette utility in new component styles. Use semantic roles; add reviewed exceptions to the token/data API.','- Do not reduce foreground opacity to create secondary text; use muted-foreground. Do not apply opacity to a whole badge/control except during the legacy migration.']
# Resolve variables through cascade to calculate light/preset pairs.
for name,selector,islight in [('Light',':root',True),('Pure Light',"[data-app-theme='pure-light']",True),('Magic Blue',"[data-app-theme='magic-blue']",False),('Classic Dark',"[data-app-theme='classic-dark']",False)]:
 env={}
 for sel in [':root']+([] if islight else ['.dark'])+([] if selector==':root' else [selector]):
  for m in re.finditer(re.escape(sel)+r'\s*\{(.*?)\}',proposal,re.S):
   for key,value in re.findall(r'(--[\w-]+):\s*([^;]+);',m.group(1)):env[key]=value.strip()
 def resolve_role(key):
  v=env['--'+key]
  for _ in range(10):
   if v.startswith('var('):v=env[v[4:-1]]
   else:break
  return v
 lines+=['','## '+name+' proposed pair matrix','','The preset background/surface colors remain existing values; primary/focus/status semantic mappings are proposed overrides. Disabled-only pairs are measured but exempt. Card/popover/sidebar/secondary aliases use their actual preset surface below.','','| Text role | Background | Container/card | Popover | Sidebar | Accent/status/secondary |','| --- | ---: | ---: | ---: | ---: | ---: |']
 for t in texts:
  lines.append('| `--'+t+'` | '+' | '.join(f'{ratio(resolve_role(t),resolve_role(b)):.2f}:1'+(' (inactive only)' if t=='text-disabled' else (' FAIL' if ratio(resolve_role(t),resolve_role(b))<4.5 else '')) for b in ['background','container','popover','sidebar','accent'])+' |')
 lines+=['','| Pair | Contrast | Requirement |','| --- | ---: | --- |']
 for a,b,req in [('primary-foreground','primary',4.5),('primary-foreground','action-hover',4.5),('primary-foreground','action-active',4.5),('destructive-foreground','destructive',4.5),('destructive-foreground','destructive-hover',4.5),('destructive-foreground','destructive-active',4.5),('ring','background',3),('ring','accent',3),('input','background',3),('input','accent',3)]:
  r=ratio(resolve_role(a),resolve_role(b));lines.append(f'| `--{a}` / `--{b}` | {r:.2f}:1 | {req}:1'+(' FAIL' if r<req else ' pass')+' |')
 lines+=['','Host values: '+', '.join(f'`--{k}={resolve_role(k)}`' for k in ['background','container','popover','sidebar','accent','foreground','muted-foreground','brand-text','success','warning','error'])+'.']
(out/'01-color.md').write_text('\n'.join(lines)+'\n')
print('Pair audit',[(t,min(ratio(val(t),val(b)) for b in backgrounds)) for t in texts]);print('tokens and patch generated')
