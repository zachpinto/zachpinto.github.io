import os
import pandas as pd

from bokeh.io       import output_file, save
from bokeh.models   import GeoJSONDataSource, ColumnDataSource, HoverTool, TapTool, CustomJS, Div
from bokeh.plotting import figure
from bokeh.layouts import row
from bokeh.palettes import Category20
from bokeh.events   import DocumentReady

# ─── paths ──────────────────────────────────────────────────────────────────
BASE_DIR        = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INSPECTIONS_CSV = os.path.join(BASE_DIR, "data", "inspections_processed.csv")
# relative to the HTML (which lives in outputs/)
NEIGHBOR_PATH   = "../data/neighborhoods.geojson"
OUTPUT_HTML     = os.path.join(BASE_DIR, "outputs", "restaurant_inspections.html")

def main():
    # 1) load inspections data
    df = pd.read_csv(INSPECTIONS_CSV)
    df["lat"] = df["latitude"].astype(float)
    df["lon"] = df["longitude"].astype(float)
    src = ColumnDataSource(df)

    # 2) create an *empty* GeoJSONDataSource
    geo_src = GeoJSONDataSource(geojson="{}")

    # 3) figure
    p = figure(
        title="NYC Restaurant Inspections",
        tools="pan,wheel_zoom,reset,tap",
        match_aspect=True,
        x_axis_location=None, y_axis_location=None,
        sizing_mode="stretch_both"
    )
    p.grid.grid_line_color = None

    # 4) draw neighborhoods (they’ll appear once we fill geo_src via JS)
    p.patches("xs","ys", source=geo_src,
              fill_alpha=0.1, line_color="gray")

    # 5) fetch the GeoJSON *after* the page loads
    fetch_cb = CustomJS(args=dict(geo_src=geo_src), code=f"""
      fetch("{NEIGHBOR_PATH}")
        .then(r => r.text())
        .then(text => geo_src.geojson = text)
        .catch(e => console.error("GeoJSON load failed:", e));
    """)
    p.js_on_event(DocumentReady, fetch_cb)

    # 6) draw restaurant pins
    circles = p.scatter("lon","lat", source=src,
                        size=6, alpha=0.6, color=Category20[20][2])

    # 7) hover tool for pins
    hover = HoverTool(renderers=[circles], tooltips=[
      ("Name",   "@dba"),
      ("Address","@address"),
      ("Cuisine","@cuisine_description"),
      ("Violation","@violation_description"),
    ])
    p.add_tools(hover)

    # 8) clicking a neighborhood filters & zooms
    tap_cb = CustomJS(args=dict(src=src, nbr=geo_src, plot=p), code="""
      const ids = nbr.selected.indices;
      if (!ids.length) return;
      const feat = JSON.parse(nbr.geojson).features[ids[0]];
      const target = feat.properties.nta;
      const d = src.data, keep = [];
      for (let i=0; i<d.nta.length; i++)
        if (d.nta[i]===target) keep.push(i);
      src.selected.indices = keep;
      const coords = feat.geometry.coordinates[0][0];
      const xs = coords.map(c=>c[0]), ys = coords.map(c=>c[1]);
      plot.x_range.start = Math.min(...xs);
      plot.x_range.end   = Math.max(...xs);
      plot.y_range.start = Math.min(...ys);
      plot.y_range.end   = Math.max(...ys);
    """)
    p.add_tools(TapTool(callback=tap_cb))

    # 9) side‐panel placeholder
    info = Div(text="<h3>Click a restaurant pin</h3>", width=300)

    # 10) output
    os.makedirs(os.path.dirname(OUTPUT_HTML), exist_ok=True)
    output_file(OUTPUT_HTML, title="Restaurant Inspections")
    save(row(p, info, sizing_mode="stretch_both"))
    print(f"Written → {OUTPUT_HTML}")

if __name__=="__main__":
    main()
