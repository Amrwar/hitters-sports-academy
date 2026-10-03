"""Single source of truth for HITTERS logo geometry (unskewed units, cap height = 100).
Applied transform: skewX(-28deg)  ->  x_screen = x - TAN*y,  TAN = 0.54"""
TAN = 0.54
H = 100          # cap height
S = 45           # stem / side width
B = 22           # bar thickness
W = 132          # standard extended letter width
GAP = 16

def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

def letter_H():
    leg, notch, slab, gap, depth = 46, 40, 44, 12, 26
    top = [(0,0),(leg,0),(leg,depth),(leg+notch,depth),(leg+notch,0),(2*leg+notch,0),(2*leg+notch,slab),(0,slab)]
    y0 = slab+gap
    bot = [(0,y0),(2*leg+notch,y0),(2*leg+notch,H),(leg+notch,H),(leg+notch,H-depth),(leg,H-depth),(leg,H),(0,H)]
    return [top, bot], 2*leg+notch

def letter_I():
    return [rect(0,0,S,H)], S

def letter_T():
    c = W/2
    return [rect(0,0,W,B), rect(c-S/2,B,c+S/2,H)], W

def letter_E():
    return [rect(0,0,S,H), rect(0,0,W,B), rect(0,39,W,61), rect(0,H-B,W,H)], W

def letter_R():
    w = 130
    stem = rect(0,0,S,H)
    bowl = [(0,0),(w,0),(w,44),(113,62),(0,62)]          # outer bowl with chamfered bottom-right
    counter = rect(S,22,w-S,40)                          # subtract
    leg = [(65,62),(113,62),(141,H),(93,H)]
    return [stem, ("sub", bowl, counter), leg], 141

def letter_S():
    top = [(15,0),(W,0),(W,B),(0,B)]                     # top bar, top-left chamfer
    left = rect(0,0,S,61)
    mid = [(0,39),(122,39),(W,58),(W,61),(18,61),(0,42)] # middle bar with diagonal transitions
    right = rect(W-S,39,W,H)
    bot = [(0,H-B),(W,H-B),(118,H),(0,H)]                # bottom bar, bottom-right chamfer
    return [top,left,mid,right,bot], W

LETTERS = [("H",letter_H,GAP),("I",letter_I,GAP),("T",letter_T,GAP),("T",letter_T,GAP),("E",letter_E,GAP),("R",letter_R,30),("S",letter_S,0)]

def wordmark():
    """Returns list of (fill_polys, sub_polys) placed along x, and total unskewed width."""
    x = 0; out = []
    for name, fn, gap in LETTERS:
        polys, w = fn()
        for p in polys:
            if isinstance(p, tuple):
                _, outer, hole = p
                out.append(([(px+x,py) for px,py in outer], [(px+x,py) for px,py in hole]))
            else:
                out.append(([(px+x,py) for px,py in p], None))
        x += w + gap
    return out, x

def skew(pts):
    return [(x - TAN*y, y) for x,y in pts]

def path_d(pts):
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x,y in pts) + " Z"

def svg_paths(polys):
    """SVG path strings in SCREEN coords, shifted so min x = 0."""
    d = []
    for outer, hole in polys:
        s = path_d(skew(outer))
        if hole: s += " " + path_d(skew(hole))
        d.append(s)
    return d
