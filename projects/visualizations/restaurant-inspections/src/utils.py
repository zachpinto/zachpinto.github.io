import sys
import os
import json
from sodapy import Socrata

API_DOMAIN    = "data.cityofnewyork.us"
DATASET_ID    = "43nn-pn8j"
RAW_JSON_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "data", "inspections_raw.json")
)

def fetch_raw_inspections(app_token=None, chunk_size=1000):
    """
    Pages through the full API (all ~280k rows) and writes JSON to data/inspections_raw.json.
    """
    client     = Socrata(API_DOMAIN, app_token)
    all_results = []
    offset     = 0

    while True:
        batch = client.get(DATASET_ID, limit=chunk_size, offset=offset)
        if not batch:
            break
        all_results.extend(batch)
        offset += chunk_size
        print(f"Fetched {offset} rows…")

    with open(RAW_JSON_PATH, "w") as fp:
        json.dump(all_results, fp)
    print(f"Total records: {len(all_results)} → {RAW_JSON_PATH}")
