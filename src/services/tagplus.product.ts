import {
	CurrencyService,
	Product,
	ProductCollectionService,
	ProductService,
	ProductStatus,
	ProductVariantService,
	ShippingProfileService,
	Store,
	StoreService,
	TransactionBaseService,
	ProductVariant,
	ShippingProfile,
} from "@medusajs/medusa";
import TagPlusClientService, { PluginOptions } from "./tagplus.client";
import { type Product as TagPlusProduct } from "../utils/tagplus.types";

import { EntityManager } from "typeorm";
import { Category } from "../utils/tagplus.types";

type InjectedDependencies = {
	productService: ProductService;
	tagplusClientService: TagPlusClientService;
	currencyService: CurrencyService;
	productVariantService: ProductVariantService;
	productCollectionService: ProductCollectionService;
	shippingProfileService: ShippingProfileService;
	storeService: StoreService;
	manager: EntityManager;
};

class TagPlusProductService extends TransactionBaseService {
	protected options_: PluginOptions;
	protected productService_: ProductService;
	protected tagplusClientService_: TagPlusClientService;
	protected currencyService_: CurrencyService;
	protected productVariantService_: ProductVariantService;
	protected productCollectionService_: ProductCollectionService;
	protected shippingProfileService_: ShippingProfileService;
	protected storeServices_: StoreService;
	protected currencies: string[];
	protected defaultShippingProfileId: ShippingProfile;

	constructor(container: InjectedDependencies, options: PluginOptions) {
		super(container);
		this.manager_ = container.manager;
		this.options_ = options;
		this.productService_ = container.productService;
		this.tagplusClientService_ = container.tagplusClientService;
		this.currencyService_ = container.currencyService;
		this.productVariantService_ = container.productVariantService;
		this.productCollectionService_ = container.productCollectionService;
		this.shippingProfileService_ = container.shippingProfileService;
		this.storeServices_ = container.storeService;

		this.currencies = [];
		this.defaultShippingProfileId = null;
	}

	async create(productData: TagPlusProduct): Promise<void> {
		return this.atomicPhase_(async (manager) => {
			//check if product exists
			const existingProduct: Product = await this.productService_
				.withTransaction(manager)
				.retrieveByExternalId(String(productData.id), {
					relations: ["variants", "options", "images"],
				})
				.catch(() => undefined);

			if (existingProduct) {
				return this.update(productData, existingProduct);
			} else {
				const existingVariant: ProductVariant = await this.productVariantService_
					.withTransaction(manager)
					.retrieveBySKU(productData.codigo)
					.catch(() => undefined);

				if (existingVariant) {
					return this.updateVariant(productData, existingVariant);
				}
			}

			await this.getCurrencies();

			const normalizedProduct = this.normalizeProduct(productData);
			normalizedProduct.profile_id = await this.getDefaultShippingProfile();

			try {
				if (productData.categoria?.id) {
					await this.setCategory(productData.categoria, normalizedProduct, manager);
				}
			} catch (error) {
				console.log(error);
			}

			// retrieve stock

			// let stockValue = await this.tagplusClientService_.retrieveStockValues(
			// 	productData.product.associations.stock_availables[0].id
			// );

			// creates the options of the product

			// if (productData.product.associations.product_option_values?.length >= 1) {
			// 	for await (const item of productData.product.associations.product_option_values) {
			// 		let optionValue = await this.tagplusClientService_.retrieveOptionValues(item.id);
			// 		let optionData = await this.tagplusClientService_.retrieveOption(
			// 			optionValue.data.product_option_value.id_attribute_group
			// 		);
			// 		if (
			// 			!normalizedProduct.options.some((ele) => {
			// 				return ele.metadata.tagplus_id == optionData.data.product_option.id;
			// 			})
			// 		) {
			// 			normalizedProduct.options.push(this.normalizeOption(optionData.data.product_option));
			// 		}
			// 	}
			// }

			//create product
			let product;
			try {
				product = await this.productService_.withTransaction(manager).create(normalizedProduct);
			} catch (error) {
				console.log(error);
			}

			if (productData.itens_vinculados?.length >= 1) {
				//insert the configurable product's simple products as variants
				//re-retrieve product with options
				product = await this.productService_.withTransaction(manager).retrieve(product.id, {
					relations: ["options"],
				});

				//attached option id to normalized options
				normalizedProduct.options = normalizedProduct.options.map((option) => {
					const productOption = product.options.find((o) => o.title === option.title);

					return {
						...option,
						id: productOption.id,
					};
				});

				// //retrieve simple products as variants
				// const variants = await this.magentoClientService_
				//   .retrieveSimpleProductsAsVariants(productData.extension_attributes?.configurable_product_links);

				// for await (const item of productData.product.associations.combinations) {
				// 	let combinationValues = await this.tagplusClientService_.retrieveCombinationValues(
				// 		item.id
				// 	);
				// 	let options = [];
				// 	for await (const optionValueId of combinationValues.data.combination.associations
				// 		.product_option_values) {
				// 		let optionValues = await this.tagplusClientService_.retrieveOptionValues(
				// 			optionValueId.id
				// 		);
				// 		normalizedProduct.options.map((element) => {
				// 			if (
				// 				element.metadata.tagplus_id ==
				// 				optionValues.data.product_option_value.id_attribute_group
				// 			) {
				// 				let option = {
				// 					option_id: element.id,
				// 					value: optionValues.data.product_option_value.name,
				// 					metadata: {
				// 						tagplus_id: optionValues.data.product_option_value.id,
				// 					},
				// 				};
				// 				options.push(option);
				// 			}
				// 		});
				// 	}

				// 	for await (const stockAvailabe of productData.product.associations
				// 		.stock_availables) {
				// 		if (stockAvailabe.id_product_attribute == item.id) {
				// 			stockValue = await this.tagplusClientService_.retrieveStockValues(
				// 				stockAvailabe.id
				// 			);
				// 		}
				// 	}

				// 	if (stockValue.data.stock_available.out_of_stock == 0) {
				// 		combinationValues.data.combination.allow_backorder = false;
				// 	} else {
				// 		combinationValues.data.combination.allow_backorder = true;
				// 	}

				// 	combinationValues.data.combination.inventory_quantity = parseInt(
				// 		stockValue.data.stock_available.quantity
				// 	);

				// 	const variantData = await this.normalizeVariant(
				// 		combinationValues.data.combination,
				// 		options
				// 	);

				// 	try {
				// 		await this.productVariantService_
				// 			.withTransaction(manager)
				// 			.create(product.id, variantData);
				// 	} catch (error) {
				// 		console.log(error);
				// 	}
				// }

				// it's not neccesary because it just download all the images associated to the product, since Medusa doesn't associate an especific image to a variant.

				//   if (v.media_gallery_entries) {
				//     //update products images with variant's images
				//     productImages.push(...v.media_gallery_entries.map((entry) => entry.url));
				//   }
				// }
			} else {
				//insert a default variant for a simple product
				// if (stockValue.data.stock_available.out_of_stock == 0) {
				// 	productData.product.allow_backorder = false;
				// } else {
				// 	productData.product.allow_backorder = true;
				// }

				const variantData = this.normalizeVariant(productData, []);

				variantData.title = "Default";

				try {
					await this.productVariantService_
						.withTransaction(manager)
						.create(product.id, variantData);
				} catch (error) {
					console.log(error);
				}
			}
		});
	}

	async update(productData: any, existingProduct: Product): Promise<void> {
		return this.atomicPhase_(async (manager) => {
			//retrieve store's currencies

			const optionsTagPlus = [];
			const optionsValueTagPlus = [];

			await this.getCurrencies();

			const normalizedProduct = this.normalizeProduct(productData);
			let productOptions = existingProduct.options;

			if (productData.data.categoria?.id) {
				await this.setCategory(productData.data.categoria, normalizedProduct, manager);
			}

			// let stockValue = await this.tagplusClientService_.retrieveStockValues(
			// 	productData.data.product.associations.stock_availables[0].id
			// );

			productOptions = (
				await this.productService_
					.withTransaction(manager)
					.retrieveByExternalId(productData.data.id, {
						relations: ["options", "options.values"],
					})
			).options;

			// var newOptions = [];

			// has options
			// if (productData.data.product.associations.product_option_values?.length >= 1) {
			// 	// retrieve options
			// 	for await (const item of productData.data.product.associations.product_option_values) {
			// 		// productData.data.product.associations.product_option_values.map(async (item, index)=>{

			// 		let optionValue = await this.tagplusClientService_.retrieveOptionValues(item.id);

			// 		optionsValueTagPlus.push(optionValue.data);

			// 		const existingOption = productOptions.find(
			// 			(o) =>
			// 				o.metadata.tagplus_id ==
			// 				optionValue.data.product_option_value.id_attribute_group
			// 		);

			// 		let option = await this.tagplusClientService_.retrieveOption(
			// 			optionValue.data.product_option_value.id_attribute_group
			// 		);

			// 		optionsTagPlus.push(option.data);

			// 		if (!existingOption) {
			// 			//add option
			// 			await this.productService_
			// 				.withTransaction(manager)
			// 				.addOption(existingProduct.id, option.data.product_option.name);
			// 		}

			// 		//update option and its values
			// 		const normalizedOption = this.normalizeOption(option.data.product_option);
			// 		delete normalizedOption.values;

			// 		await this.productService_
			// 			.withTransaction(manager)
			// 			.updateOption(existingProduct.id, existingOption.id, normalizedOption);
			// 	}

			// 	//check if there are options that should be deleted
			// 	const optionsToDelete = productOptions.filter(
			// 		(o) =>
			// 			!optionsTagPlus.find((tagplus_option) => {
			// 				return tagplus_option.product_option.id == o.metadata.tagplus_id;
			// 			})
			// 	);

			// 	optionsToDelete.forEach(async (option) => {
			// 		await this.productService_
			// 			.withTransaction(manager)
			// 			.deleteOption(existingProduct.id, option.id);
			// 	});

			// 	//re-retrieve product options
			// 	productOptions = (
			// 		await this.productService_
			// 			.withTransaction(manager)
			// 			.retrieveByExternalId(productData.data.product.id, {
			// 				relations: ["options", "options.values"],
			// 			})
			// 	).options;
			// }

			// it would be neccesary that ImageRepo will store metadata image_id of tagplus in order to check if the image is already uploaded.

			// let productImages = existingProduct.images.map((image) => image.url);
			let productImages = normalizedProduct.images;
			delete normalizedProduct.images;

			if (productData.data.product.associations.combinations?.length >= 1) {
				// //attach values to the options
				// productOptions = productOptions.map((productOption) => {
				// 	const productDataOption = optionsValueTagPlus.find(
				// 		(o) =>
				// 			productOption.metadata.tagplus_id == o.product_option_value.id_attribute_group
				// 	);
				// 	if (productDataOption) {
				// 		productOption.values = this.normalizeOptionValues(productDataOption).values;
				// 	}
				// 	return productOption;
				// });
				// // delete combinations
				// existingProduct.variants.map(async (variant, key) => {
				// 	let existsVariant = await this.tagplusClientService_.retrieveCombinationValues(
				// 		variant.metadata.tagplus_id as string
				// 	);
				// 	if (existsVariant === null) {
				// 		try {
				// 			await this.productVariantService_.withTransaction(manager).delete(variant.id);
				// 			delete existingProduct.variants[key];
				// 		} catch (error) {
				// 			console.log(error);
				// 		}
				// 	}
				// });
				// // //retrieve simple products as variants
				// // const variants = await this.magentoClientService_
				// //   .retrieveSimpleProductsAsVariants(productData.extension_attributes?.configurable_product_links);
				// for await (const item of productData.data.product.associations.combinations) {
				// 	const existingVariant = existingProduct.variants.find(async (variant) => {
				// 		return variant.metadata.tagplus_id + "" === item.id;
				// 	});
				// 	if (existingVariant != null) {
				// 		let combinationValues = await this.tagplusClientService_.retrieveCombinationValues(
				// 			item.id
				// 		);
				// 		let options = [];
				// 		for await (const optionValueId of combinationValues.data.combination.associations
				// 			.product_option_values) {
				// 			let optionValues = await this.tagplusClientService_.retrieveOptionValues(
				// 				optionValueId.id
				// 			);
				// 			productOptions.map((element) => {
				// 				if (
				// 					element.metadata.tagplus_id ==
				// 					optionValues.data.product_option_value.id_attribute_group
				// 				) {
				// 					let option = {
				// 						option_id: element.id,
				// 						value: optionValues.data.product_option_value.name,
				// 						metadata: {
				// 							tagplus_id: optionValues.data.product_option_value.id,
				// 						},
				// 					};
				// 					options.push(option);
				// 				}
				// 			});
				// 		}
				// 		for await (const stockAvailabe of productData.data.product.associations
				// 			.stock_availables) {
				// 			if (stockAvailabe.id_product_attribute == item.id) {
				// 				stockValue = await this.tagplusClientService_.retrieveStockValues(
				// 					stockAvailabe.id
				// 				);
				// 			}
				// 		}
				// 		combinationValues.data.combination.inventory_quantity = parseInt(
				// 			stockValue.data.stock_available.quantity
				// 		);
				// 		if (stockValue.data.stock_available.out_of_stock == 0) {
				// 			combinationValues.data.combination.allow_backorder = false;
				// 		} else {
				// 			combinationValues.data.combination.allow_backorder = true;
				// 		}
				// 		const variantData = await this.normalizeVariant(
				// 			combinationValues.data.combination,
				// 			options,
				// 			productData.data.product.price
				// 		);
				// 		variantData.options.forEach((element, key) => {
				// 			if (Object.is(variantData.options.length - 1, key)) {
				// 				variantData.title = element.value;
				// 			} else {
				// 				variantData.title = element.value + " - ";
				// 			}
				// 		});
				// 		try {
				// 			await this.productVariantService_
				// 				.withTransaction(manager)
				// 				.update(existingVariant.id, variantData);
				// 		} catch (error) {
				// 			console.log(error);
				// 		}
				// 	} else {
				// 		let combinationValues = await this.tagplusClientService_.retrieveCombinationValues(
				// 			item.id
				// 		);
				// 		let options = [];
				// 		for await (const optionValueId of combinationValues.data.combination.associations
				// 			.product_option_values) {
				// 			let optionValues = await this.tagplusClientService_.retrieveOptionValues(
				// 				optionValueId.id
				// 			);
				// 			productOptions.map((element) => {
				// 				if (
				// 					element.metadata.tagplus_id ==
				// 					optionValues.data.product_option_value.id_attribute_group
				// 				) {
				// 					let option = {
				// 						option_id: element.id,
				// 						value: optionValues.data.product_option_value.name,
				// 						metadata: {
				// 							tagplus_id: optionValues.data.product_option_value.id,
				// 						},
				// 					};
				// 					options.push(option);
				// 				}
				// 			});
				// 		}
				// 		for await (const stockAvailabe of productData.data.product.associations
				// 			.stock_availables) {
				// 			if (stockAvailabe.id_product_attribute == item.id) {
				// 				stockValue = await this.tagplusClientService_.retrieveStockValues(
				// 					stockAvailabe.id
				// 				);
				// 			}
				// 		}
				// 		if (stockValue.data.stock_available.out_of_stock == 0) {
				// 			combinationValues.data.combination.allow_backorder = false;
				// 		} else {
				// 			combinationValues.data.combination.allow_backorder = true;
				// 		}
				// 		combinationValues.data.combination.inventory_quantity = parseInt(
				// 			stockValue.data.stock_available.quantity
				// 		);
				// 		const variantData = await this.normalizeVariant(
				// 			combinationValues.data.combination,
				// 			options,
				// 			productData.data.product.price
				// 		);
				// 		variantData.options.forEach((element, key) => {
				// 			if (Object.is(variantData.options.length - 1, key)) {
				// 				variantData.title = element.value;
				// 			} else {
				// 				variantData.title = element.value + " - ";
				// 			}
				// 		});
				// 		try {
				// 			await this.productVariantService_
				// 				.withTransaction(manager)
				// 				.create(existingProduct.id, variantData);
				// 		} catch (error) {
				// 			console.log(error);
				// 		}
				// 	}
				// }
				// it's not neccesary because it just download all the images associated to the product, since Medusa doesn't associate an especific image to a variant.
				//   if (v.media_gallery_entries) {
				//     //update products images with variant's images
				//     productImages.push(...v.media_gallery_entries.map((entry) => entry.url));
				//   }
				// }
			} else {
				//insert a default variant for a simple product
				// if (stockValue.data.stock_available.out_of_stock == 0) {
				// 	productData.data.product.allow_backorder = false;
				// } else {
				// 	productData.data.product.allow_backorder = true;
				// }

				// productData.data.product.inventory_quantity = parseInt(
				// 	stockValue.data.stock_available.quantity
				// );

				const variantData = this.normalizeVariant(productData.data, []);

				variantData.title = "Default";

				// checks if there is just one variant so it's a simple product.
				// if it's equal 1 it means that is the same variant so it will update it
				// otherwise it will create it.

				if (existingProduct.variants.length == 1) {
					try {
						await this.productVariantService_
							.withTransaction(manager)
							.update(existingProduct.variants[0].id, variantData);
					} catch (error) {
						console.log(error);
					}
				} else {
					try {
						await this.productVariantService_
							.withTransaction(manager)
							.create(existingProduct.id, variantData);
					} catch (error) {
						console.log(error);
					}
				}
			}

			productImages = [...new Set(productImages)];

			//update product
			delete normalizedProduct.options;
			delete normalizedProduct.images;

			const update = {};

			for (const key of Object.keys(normalizedProduct)) {
				if (normalizedProduct[key] !== existingProduct[key]) {
					update[key] = normalizedProduct[key];
				}
			}

			// normalizedProduct.images = productImages;

			if (Object.values(update).length) {
				await this.productService_.withTransaction(manager).update(existingProduct.id, update);
			}
		});
	}

	async updateVariant(productData: any, existingVariant: ProductVariant): Promise<void> {
		return this.atomicPhase_(async (manager: EntityManager) => {
			//retrieve store's currencies
			await this.getCurrencies();

			const variantData = await this.normalizeVariant(productData.data.product, []);
			delete variantData.options;

			const update = {};

			for (const key of Object.keys(variantData)) {
				if (variantData[key] !== existingVariant[key]) {
					update[key] = variantData[key];
				}
			}

			if (Object.values(update).length) {
				await this.productVariantService_
					.withTransaction(manager)
					.update(existingVariant.id, variantData);
			}
		});
	}

	async getCurrencies() {
		if (this.currencies.length) {
			return;
		}

		const defaultStore: Store = await this.storeServices_.retrieve({
			relations: ["currencies", "default_currency"],
		});
		this.currencies = [];

		this.currencies.push(...(defaultStore.currencies?.map((currency) => currency.code) || []));
		this.currencies.push(defaultStore.default_currency?.code);
	}

	async getDefaultShippingProfile(): Promise<ShippingProfile> {
		if (!this.defaultShippingProfileId) {
			this.defaultShippingProfileId = await this.shippingProfileService_.retrieveDefault();
		}

		return this.defaultShippingProfileId;
	}

	async setCategory(category: Partial<Category>, product: Product, manager: EntityManager) {
		//Magento supports multiple categories for a product
		//since Medusa supports only one collection for a product, we'll
		//use the category with the highest position

		// categories.sort((a, b) => {
		//   if (a.position > b.position) {
		//     return 1;
		//   }

		//   return a.position < b.position ? -1 : 0;
		// })

		//retrieve Medusa collection using magento ID
		const [_, count] = await this.productCollectionService_.withTransaction(manager).listAndCount();

		const existingCollections = await this.productCollectionService_.withTransaction(manager).list(
			{},
			{
				skip: 0,
				take: count,
			}
		);

		if (existingCollections.length) {
			product.collection_id = existingCollections.find((collection) => {
				if (collection.metadata.tagplus_id == category.id) {
					return true;
				}

				return false;
			})?.id;
		}

		return product;
	}

	normalizeProduct(product: TagPlusProduct): any {
		return {
			title: product.descricao,
			handle: null,
			is_giftcard: false,
			discountable: true,
			description: product.descricao_longa,
			subtitle: product.descricao_curta,
			weight: product.peso,
			height: product.altura,
			lenght: product.comprimento,
			width: product.largura,
			// type: {
			//   value: product.type_id
			// },
			external_id: product.id,
			status: product.ativo === 1 ? ProductStatus.PUBLISHED : ProductStatus.DRAFT,
			images: product.imagens || [],
			options: [],
			collection_id: product.categoria.id,
			// tags: product.meta_keywords.map((value) => ({
			//   value: value
			// })),
			metadata: {
				tagplus_id: product.id,
				reference: product.codigo,
				manufacter_name: product.fornecedores[0].razao_social,
				date_upd: product.data_alteracao,
				meta_keywords: [],
			},
		};
	}

	normalizeVariant(variant: TagPlusProduct, options?: any[], itemPrice?: any): any {
		let total = parseFloat(itemPrice) + variant.valor_venda_varejo;
		return {
			title: variant.id,
			prices: this.currencies.map((currency) => ({
				amount: itemPrice != undefined ? this.parsePrice(total) : this.parsePrice(variant.valor_venda_varejo),
				currency_code: currency,
			})),
			sku: variant.codigo === "" ? null : variant.codigo,
			barcode: variant.codigo_barras === "" ? null : variant.codigo_barras,
			ean: variant.codigo_barras === "" ? null : variant.codigo_barras,
			upc: null,
			inventory_quantity: variant.estoque.qtd_revenda,
			allow_backorder: false,
			manage_inventory: variant.estoque.qtd_revenda > 0 ? true : false,
			weight: variant.peso || 0,
			options: options,
			metadata: {
				tagplus_id: variant.id,
			},
		};
	}

	normalizeOption(option: Record<string, any>): any {
		return {
			title: option.name,
			values: option.associations.product_option_values.map((value) => ({
				value: value.id,
				metadata: {
					tagplus_value: value.id,
				},
			})),
			metadata: {
				tagplus_id: option.id,
			},
		};
	}

	normalizeOptionValues(option: Record<string, any>): any {
		return {
			values: {
				value: option.product_option_value.name,
				metadata: {
					tagplus_value: option.product_option_value.id,
				},
			},
		};
	}

	parsePrice(price: any): number {
		return parseInt((parseFloat(Number(price).toFixed(2)) * 100).toString());
	}

	removeHtmlTags(str: string): string {
		if (str === null || str === "") {
			return "";
		}

		str = str.toString();

		// Regular expression to identify HTML tags in
		// the input string. Replacing the identified
		// HTML tag with a null string.
		return str.replace(/(<([^>]+)>)/gi, "");
	}
}

export default TagPlusProductService;
