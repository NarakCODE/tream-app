import {
  QueryClient,
  defaultShouldDehydrateQuery,
  isServer,
} from "@tanstack/react-query";
import { cache } from "react";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (failureCount >= 3) return false;
          if (error && typeof error === "object") {
            const status = "status" in error ? Number(error.status) : undefined;
            if (status && status >= 400 && status < 500) {
              return false;
            }
          }
          return true;
        },
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getBrowserQueryClient(): QueryClient {
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

const getRequestQueryClient = cache(() => makeQueryClient());

export function getQueryClient(): QueryClient {
  if (isServer) {
    return getRequestQueryClient();
  }
  return getBrowserQueryClient();
}
