export type QueryKeyFactory<
  TKey extends string,
  TFilter = Record<string, unknown>,
> = {
  all: readonly [TKey];
  lists: () => readonly [TKey, "list"];
  list: (
    filters?: TFilter,
  ) => readonly [TKey, "list", { readonly filters: TFilter | undefined }];
  details: () => readonly [TKey, "detail"];
  detail: (id: string | number) => readonly [TKey, "detail", string | number];
};

export function createKeyFactory<
  TKey extends string,
  TFilter = Record<string, unknown>,
>(key: TKey): QueryKeyFactory<TKey, TFilter> {
  return {
    all: [key] as const,
    lists: () => [key, "list"] as const,
    list: (filters?: TFilter) => [key, "list", { filters }] as const,
    details: () => [key, "detail"] as const,
    detail: (id: string | number) => [key, "detail", id] as const,
  };
}
