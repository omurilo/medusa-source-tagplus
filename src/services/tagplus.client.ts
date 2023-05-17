import { Logger } from "@medusajs/medusa/dist/types/global";
import formatRegistrationName from "@medusajs/medusa/dist/utils/format-registration-name";
import { BatchJobService, Store, StoreService, TransactionBaseService } from "@medusajs/medusa";
import axios, { AxiosInstance, AxiosResponse } from "axios";
import { EntityManager } from "typeorm";
import { MedusaError } from "medusa-core-utils";

type InjectedDependencies = {
	manager: EntityManager;
	logger: Logger;
	storeService: StoreService;
	batchJobService: BatchJobService;
};

export type PluginOptions = {
	apiVersion: string;
	apiUrl: string;
	clientId: string;
	clientSecret: string;
	scopes: string;
};

export type AuthorizeResponse = {
	access_token: string;
	refresh_token: string;
	expires_in: string;
	token_type: string;
};

class TagPlusClientService extends TransactionBaseService {
	static readonly RESOLVE_KEY = formatRegistrationName(`${process.cwd()}/services/tagplus.client.js`);
	protected manager_: EntityManager;
	protected transactionManager_: EntityManager;
	protected logger_: Logger;
	protected storeService_: StoreService;
	protected apiBaseUrl_: string;
	protected backJobService: BatchJobService;

	protected options_: PluginOptions;
	protected client_: AxiosInstance;

	constructor(container: InjectedDependencies, options) {
		super(container);
		this.manager_ = container.manager;
		this.logger_ = container.logger;
		this.storeService_ = container.storeService;
		this.options_ = options;
		this.apiBaseUrl_ = `${options.apiUrl}`;
		this.backJobService = container.batchJobService;

		this.client_ = axios.create({
			headers: {
				Accept: "application/json",
				"X-Api-Version": `${options.apiVersion}`,
			},
		});

		this.client_.interceptors.request.use(null, (error) => {
			console.log(error);
			throw new MedusaError(
				MedusaError.Types.UNEXPECTED_STATE,
				error.response?.data?.message ||
					error.request?.data?.message ||
					error.message ||
					"An error occurred while sending the request."
			);
		});

		this.client_.interceptors.response.use(null, (error) => {
			console.log(error);
			throw new MedusaError(
				MedusaError.Types.UNEXPECTED_STATE,
				error.response?.data?.message ||
					error.request?.data?.message ||
					error.message ||
					"An error occurred while sending the request."
			);
		});
	}

	async retrieveProducts(page = 1, perPage = 100): Promise<AxiosResponse<any, any>> {
		return this.sendRequest(`/produtos?page=${page}&per_page=${perPage}`);
	}

	async retrieveProduct(productId?: string): Promise<AxiosResponse<any, any>> {
		return this.sendRequest(`/produtos/${productId}`);
	}

	async retrieveProductImages(items: Record<string, any>[]): Promise<Record<string, any>[]> {
		const data = {
			items: [],
		};

		return items.map((item) => {
			const itemData = data.items.find((i) => i.id == item.id);
			if (itemData) {
				item.images = itemData.images || [];
			}

			return item;
		});
	}

	async retrieveInventoryData(sku: string): Promise<AxiosResponse<any, any>> {
		return this.sendRequest(`/stockItems/${sku}`);
	}

	async retrieveSimpleProductsAsVariants(productIds: string[]): Promise<Record<string, any>[]> {
		return this.retrieveProducts().then(async (products) => {
			return await Promise.all(
				products.map(async (variant) => {
					//get stock item of that variant
					const { data } = await this.retrieveInventoryData(variant.sku);

					return {
						...variant,
						stockData: data,
					};
				})
			);
		});
	}

	async retrieveCategories(lastUpdatedTime?: string): Promise<AxiosResponse<any, any>> {
		return this.sendRequest(`/categories/`);
	}

	async retrieveOptionsDefaults(): Promise<AxiosResponse<any, any>> {
		return this.sendRequest(`/product_options/`);
	}

	async retrieveOptionsValues(): Promise<AxiosResponse<any, any>> {
		return this.sendRequest(`/product_option_values/`);
	}

	async retrieveOptionValues(optionId?: string): Promise<AxiosResponse<any, any>> {
		return this.sendRequest(`/product_option_values/${optionId}`);
	}

	async retrieveStockValues(stockId?: string): Promise<AxiosResponse<any, any>> {
		return this.sendRequest(`/stock_availables/${stockId}`);
	}

	async retrieveCombinationValues(combinationId?: string): Promise<AxiosResponse<any, any>> {
		return this.sendRequest(`/combinations/${combinationId}`);
	}

	async retrieveOption(optionId?: string): Promise<AxiosResponse<any, any>> {
		return this.sendRequest(`/product_options/${optionId}`);
	}

	async retrieveCategory(categoryID?: string): Promise<AxiosResponse<any, any>> {
		return this.sendRequest(`/categories/${categoryID}`);
	}

	async authorize(code: string) {
		console.log('Trying authorize')
		const { data } = await this.sendRequest<string, AuthorizeResponse>(
			"/oauth2/token",
			"POST",
			`grant_type=authorization_code&code=${code}&client_id=${this.options_.clientId}&client_secret=${this.options_.clientSecret}`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
			}
		);

		await this.storeService_.update({
			metadata: {
				tagplus: {
					accessToken: data.access_token,
					refreshToken: data.refresh_token,
					expiresAt: data.expires_in,
				},
			},
		});

		return data;
	}

	async refreshToken() {
		const store = await this.storeService_.retrieve();

		if (!store) return;

		const refreshToken = (store.metadata as Record<string, any>).tagplus?.refreshToken;

		if (!refreshToken) return;

		const { data } = await this.sendRequest<string, AuthorizeResponse>(
			`/oauth2/token`,
			"POST",
			`grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${this.options_.clientId}&client_secret=${this.options_.clientSecret}`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
			}
		);

		return data;
	}

	async verifyAuthorization() {
		const store = await this.storeService_.retrieve();

		if (!store) return;

		let accessToken = (store.metadata as Record<string, any>).tagplus?.accessToken;
		let expiresAt = (store.metadata as Record<string, any>).tagplus?.expiresAt;
		let refreshToken = (store.metadata as Record<string, any>).tagplus?.refreshToken;

		if ((!accessToken || Number(expiresAt) < Date.now()) && refreshToken) {
			const accessTokenObject = await this.refreshToken();

			accessToken = accessTokenObject.access_token;
			expiresAt = accessTokenObject.expires_in;
			refreshToken = accessTokenObject.refresh_token;
		}

		if (accessToken) {
			this.client_.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
		}

		return { isAuthorized: Number(expiresAt) > Date.now(), accessToken };
	}

	async sendRequest<Data = any, TResponse = any>(
		path: string,
		method: string = "GET",
		data?: Data,
		headers?: Record<string, string>
	): Promise<AxiosResponse<TResponse>> {
		return this.client_.request({
			url: `${this.apiBaseUrl_}${path}`,
			method,
			data,
			headers,
		});
	}

	async syncProducts() {
		console.log("Creating batch job to import tagplus products...");
		await this.backJobService.create({
			type: "import-tagplus",
			context: {
				options: this.options_,
			},
      created_by: 'Admin',
			dry_run: false,
		});
	}
}

export default TagPlusClientService;
