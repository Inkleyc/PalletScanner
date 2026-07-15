export type ApiClientConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  ebayApiBaseUrl?: string;
};

export type ApiClient = {
  config: ApiClientConfig;
};

export const createApiClient = (config: ApiClientConfig): ApiClient => ({
  config,
});
