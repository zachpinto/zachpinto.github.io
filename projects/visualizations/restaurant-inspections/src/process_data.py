import os
import json
import pandas as pd
from utils import RAW_JSON_PATH

PROCESSED_CSV_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "data", "inspections_processed.csv")
)

def load_raw():
    with open(RAW_JSON_PATH) as fp:
        return json.load(fp)

def process(records):
    df = pd.DataFrame(records)
    df["latitude"]        = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"]       = pd.to_numeric(df["longitude"], errors="coerce")
    df["inspection_date"] = pd.to_datetime(df["inspection_date"], errors="coerce")
    df = df.dropna(subset=["latitude","longitude"])

    bmap = {"1":"Manhattan","2":"Bronx","3":"Brooklyn","4":"Queens","5":"Staten Island"}
    df["boro_name"] = df["boro"].map(bmap)
    df["address"]   = (
        df["building"].fillna("") + " " +
        df["street"].fillna("")   + " " +
        df["zipcode"].fillna("")
    ).str.strip()

    cols = [
      "camis","dba","boro_name","address","phone","cuisine_description",
      "inspection_date","action","violation_code","violation_description",
      "critical_flag","score","grade","latitude","longitude","nta"
    ]
    df[cols].to_csv(PROCESSED_CSV_PATH, index=False)
    print(f"Processed data → {PROCESSED_CSV_PATH}")

def main():
    records = load_raw()
    process(records)

if __name__=="__main__":
    main()
