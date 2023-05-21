export type ProductImage = {
	id: string;
	principal: Boolean;
	extensao: string;
	url: string;
	base64: string;
};

export type Stock = {
	qtd_revenda: number;
	qtd_min: number;
	qtd_max: number;
	qtd_consumo: number;
	qtd_imobilizado: number;
};

export type SellValue = {
	tipo_valor_venda: {
		id: number;
		nome: string;
		padrao: true;
		lucro: number;
	};
	id: number;
	valor_venda: number;
	lucro_utilizado: number;
};

export type Products = Array<Product>;

export type Product = {
	ativo: number;
	sincroniza: number;
	codigo: string;
	codigo_grade: string;
	codigo_barras: string;
	descricao: string;
	descricao_curta?: string;
	descricao_longa?: string;
	estoque: Stock;
	categoria: Partial<Category>;
	data_alteracao?: Date;
	data_validade?: Date;
	imagem_principal?: {
		id: string;
		url: string;
		principal: true;
	};
	imagens: string[];
	peso: number;
	largura: number;
	altura: number;
	comprimento: number;
	valores_venda: SellValue[];
	id: number;
	valor_venda_varejo: number;
	itens_vinculados: [],
	fornecedores: [
		{
			id: number;
			razao_social: string;
			nome_fantasia: string;
			cpf: string;
			cnpj: string;
			ativo: Boolean;
		}
	];
};

export type Categories = Array<Category>;

export type Category = {
	id: number;
	descricao: string;
	localizacao: string;
	tipo: string;
	categoria_mae?: {
		id: number;
		descricao: string;
		localizacao: string;
	};
};
