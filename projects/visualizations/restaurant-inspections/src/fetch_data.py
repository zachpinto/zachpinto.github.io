from utils import fetch_raw_inspections

def main():
    # chunk_size defaults to 1000; pages until empty
    fetch_raw_inspections(app_token=None, chunk_size=1000)

if __name__ == "__main__":
    main()
