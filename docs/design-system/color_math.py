"""WCAG sRGB calculations for token documentation, not runtime code."""
import math
def rgb(v):
 if v.startswith('#'):
  s=v[1:];s=''.join(c*2 for c in s) if len(s)==3 else s
  return [int(s[i:i+2],16)/255 for i in (0,2,4)]
 vals=v[v.index('(')+1:v.rindex(')')].split();L=float(vals[0].rstrip('%'))/(100 if '%' in vals[0] else 1);C=float(vals[1]);h=math.radians(float(vals[2]) if vals[2] != "none" else 0);a=C*math.cos(h);b=C*math.sin(h)
 l=(L+.3963377774*a+.2158037573*b)**3;m=(L-.1055613458*a-.0638541728*b)**3;s=(L-.0894841775*a-1.291485548*b)**3
 lin=[4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s]
 return [max(0,min(1,12.92*c if c<=.0031308 else 1.055*max(c,0)**(1/2.4)-.055)) for c in lin]
def lum(v):
 return sum(w*(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4) for w,c in zip((.2126,.7152,.0722),rgb(v)))
def ratio(a,b):
 x,y=sorted((lum(a),lum(b)));return (y+.05)/(x+.05)
def hexval(v):return '#'+''.join(f'{round(c*255):02x}' for c in rgb(v))
