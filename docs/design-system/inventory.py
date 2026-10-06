"""Reproduce lexical UI inventory from repository root; writes documentation only.
Counts are occurrences, not rendered elements. Paths and lines retain provenance.
"""
from pathlib import Path
import re,json,collections
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/design-system'
files={}
for base in ('apps/web','packages/ui/src'):
 for p in (ROOT/base).rglob('*'):
  if p.suffix in ('.tsx','.ts','.css','.mjs','.json') and not any(x in p.parts for x in ('node_modules','.next','dist')) and not any(x in p.name for x in ('.spec.','.test.')):
   files[p.relative_to(ROOT).as_posix()]=p.read_text()
# Import graph: literal local imports, reexports and dynamic imports; layouts inherited.
def resolve(src,target):
 if target.startswith('@/'): p=ROOT/'apps/web'/target[2:]
 elif target.startswith('@repo/ui/'): p=ROOT/'packages/ui/src'/target[9:]
 elif target.startswith('.'): p=(ROOT/src).parent/target
 else:return None
 for q in [p]+[Path(str(p)+e) for e in ('.tsx','.ts','.css','.mjs')]+[p/('index'+e) for e in ('.tsx','.ts')]:
  try:k=q.resolve().relative_to(ROOT).as_posix()
  except ValueError:continue
  if k in files:return k
edges={k:set(filter(None,(resolve(k,m.group(1)) for m in re.finditer(r'(?:from\s*|import\s*\(?)[\'\"]([^\'\"]+)[\'\"]',s)))) for k,s in files.items()}
pages=sorted(k for k in files if k.startswith('apps/web/app/') and k.endswith('/page.tsx'))
reach=collections.defaultdict(set)
for page in pages:
 seeds={page};parent=(ROOT/page).parent
 while parent!=ROOT/'apps/web':
  for name in ('layout.tsx','template.tsx'):
   k=(parent/name).relative_to(ROOT).as_posix()
   if k in files:seeds.add(k)
  parent=parent.parent
 seen=set();todo=list(seeds)
 while todo:
  k=todo.pop()
  if k in seen:continue
  seen.add(k);todo.extend(edges.get(k,()))
 for k in seen:reach[k].add(page)
patterns={
 'colors':r'(?<![\w-])#[0-9a-fA-F]{3,8}\b|%23[0-9a-fA-F]{6}\b|(?:rgba?|hsla?|oklch|oklab|color-mix)\([^\n;]*?\)',
 'arbitrary':r'(?:[\w@-]+:)*[!\w-]+-\[(?:[^\[\]\n]|\[[^\]\n]*\])+\](?:/[\w.]+)?',
 'inline-style':r'style\s*=\s*\{',
 'color-utilities':r'(?<![\w-])(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|shadow)-(?:transparent|current|white|black|inherit|[a-z]+-(?:\d{2,3})|background|foreground|card(?:-foreground)?|popover(?:-foreground)?|primary(?:-foreground)?|secondary(?:-foreground)?|muted(?:-foreground)?|accent(?:-foreground)?|destructive(?:-foreground)?|input|ring|border|container|sidebar[\w-]*|chart-\d)(?:/[\d.]+)?\b',
 'typography':r'(?<![\w-])(?:text-(?:xs|sm|base|lg|xl|[2-9]xl)|font-(?:sans|mono|serif|thin|extralight|light|normal|medium|semibold|bold|extrabold|black)|leading-[\w.]+|tracking-[\w.-]+)\b',
 'spacing':r'(?<![\w-])-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy])-(?:\d+(?:\.\d+)?|px|auto)\b',
 'radius':r'(?<![\w-])rounded(?:-[trblse]{1,2})?(?:-(?:none|sm|md|lg|xl|[2-4]xl|full))?(?![\w\[-])',
 'elevation':r'(?<![\w-])shadow(?:-(?:2xs|xs|sm|md|lg|xl|2xl|inner|none))?(?![\w\[-])',
 'z-index':r'(?<![\w-])-?z-(?:\d+|auto)\b',
 'css-media':r'@media[^\{]+',
 'breakpoints':r'(?<![\w-])(?:sm|md|lg|xl|2xl):',
 'css-declarations':r'--[\w-]+\s*:[^;\n]+|(?:font|font-family|font-size|font-weight|line-height|letter-spacing|padding(?:-[\w]+)?|margin(?:-[\w]+)?|gap|row-gap|column-gap|border-radius|box-shadow|z-index)\s*:[^;\n]+',
}
data={}
for category,pat in patterns.items():
 values=collections.defaultdict(list)
 for k,s in files.items():
  matches=list(re.finditer(pat,s))
  if category=='colors':
   matches=list(re.finditer(r'(?<![\w-])#[0-9a-fA-F]{3,8}\b|%23[0-9a-fA-F]{6}\b|(?:rgba?|hsla?|oklch|oklab|color-mix)\(',s))
  for m in matches:
   value=m.group()
   if category in ('colors','inline-style') and value.endswith(('(', '{')):
    opening='(' if category=='colors' else '{';closing=')' if category=='colors' else '}'
    depth=1;end=m.end()
    while end<len(s) and depth:
     if s[end]==opening:depth+=1
     elif s[end]==closing:depth-=1
     end+=1
    value=s[m.start():end].replace('\n',' ').strip()
   values[value].append({'path':k,'line':s.count('\n',0,m.start())+1})
 data[category]=[{'value':v,'count':len(loc),'files':len(set(x['path'] for x in loc)),'route_reach':len(set().union(*(reach[x['path']] for x in loc))),'locations':loc} for v,loc in sorted(values.items(),key=lambda x:(-len(x[1]),x[0]))]
# Component usage, names and props at openings, preserving aliases in raw source caveat.
components=collections.defaultdict(list)
for k,s in files.items():
 if not k.endswith('.tsx'):continue
 for m in re.finditer(r'<([A-Z][\w.]*)\b([^<>]*?)>',s,re.S):
  if m.group(1) in ('T','TData','TValue','TContext') or re.search(r'\b(?:extends|keyof)\b',m.group(2)):continue
  components[m.group(1)].append({'path':k,'line':s.count('\n',0,m.start())+1,'props':re.findall(r'\b([\w-]+)\s*=',m.group(2))})
data['components']=[{'value':v,'count':len(loc),'files':len(set(x['path'] for x in loc)),'route_reach':len(set().union(*(reach[x['path']] for x in loc))),'locations':loc} for v,loc in sorted(components.items(),key=lambda x:(-len(x[1]),x[0]))]
meta={'files':len(files),'page_routes':len(pages),'pages':pages,'route_reach_by_file':{k:sorted(v) for k,v in reach.items()},'scope':'apps/web source/config plus packages/ui/src; excludes generated folders and test/spec files; includes registry, mock-data, store, JSON and comments. Lexical matches may include samples and data. JSX openings with nested <> or aliased imports need manual review. Reach is conservative static import closure including layouts, not runtime usage; unused exports inflate reach, unresolved package entrypoints/dynamic imports can undercount.'}
(OUT/'inventory.json').write_text(json.dumps({'methodology':meta,'categories':data},indent=2)+'\n')
for name,cats in {'audit-colors':['colors','color-utilities','inline-style'],'audit-foundations':['typography','spacing','radius','elevation','z-index','breakpoints','css-media','arbitrary','css-declarations'],'audit-component-counts':['components']}.items():
 lines=[f'# {name.replace("-"," ").title()}','',meta['scope'],'',f'Scanned {len(files)} files and {len(pages)} page route templates. Counts are literal source occurrences; reach counts route templates, never sessions or runtime screens. Full location arrays and route sets: [inventory.json](inventory.json). Reproduce: `python3 docs/design-system/inventory.py`.','']
 for cat in cats:
  lines += ['## '+cat,'','| Value | Occurrences | Files | Route reach | Paths and lines (occurrences per file) |','| --- | ---: | ---: | ---: | --- |']
  for row in data[cat]:
   grouped=collections.defaultdict(list)
   for x in row['locations']:grouped[x['path']].append(x['line'])
   paths='; '.join(f'`{k}:{",".join(map(str,sorted(set(v))))}` ({len(v)})' for k,v in grouped.items())
   val=row['value'].replace('|','\\|').replace('`','\\`')
   lines.append(f'| `{val}` | {row["count"]} | {row["files"]} | {row["route_reach"]} | {paths} |')
  lines+=['']
 (OUT/(name+'.md')).write_text('\n'.join(lines))
print(json.dumps({'files':len(files),'routes':len(pages),'categories':{k:len(v) for k,v in data.items()}}))
for cat in ('color-utilities','typography','spacing','radius','elevation','z-index','breakpoints','components'):
 print(cat,[(r['value'],r['count'],r['route_reach']) for r in data[cat][:18]])
