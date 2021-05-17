class SearchCacheController {
  private _cache = {};
  private readonly _ALL_RESULTS_KEY = 'COMMONWEALTH_ALL_RESULTS';
  public static readonly SEARCH_PAGE_SIZE = 50;  // must be same as SQL limit specified in the database query

  public get allResults() {
    return this._cache[this._ALL_RESULTS_KEY];
  }
  public resetAllResults() {
    this._cache[this._ALL_RESULTS_KEY] = { loaded: false };
  }
  public getKey(key: string) {
    return this._cache[key];
  }
  public initKey(key: string) {
    this._cache[key] = { loaded: false };
  }
}

export default SearchCacheController;
