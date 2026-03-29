# Template de Prompt para Geração de Dataset com IA Externa

Use este prompt no Claude.ai, ChatGPT, Gemini, ou qualquer outro chat de IA para gerar
documentos no formato correto para o Palm Map. Depois, copie o JSON gerado e use o botão
**Datasets** no app para validar e fazer upload.

---

## Como usar

1. Copie o bloco de prompt abaixo
2. Substitua `[CIDADE]` pelo nome da cidade (ex: `Salvador`)
3. Substitua `[LISTA DE LUGARES]` por uma lista separada por vírgulas
4. Cole no chat da IA e envie
5. Copie a resposta JSON
6. Abra o app → clique em **Datasets** → cole no passo 2

---

## Prompt template

```
Você é um especialista em turismo brasileiro. Gere um JSON array de documentos sobre lugares reais de [CIDADE], seguindo EXATAMENTE este schema.

Retorne APENAS o JSON array, sem explicação, sem markdown, sem ``` ao redor.

Schema de cada documento:
{
  "id": "string — <cidade-lowercase>-<category>-<slug-do-lugar>",
  "city": "[CIDADE]",
  "title": "string — nome do lugar",
  "category": "attraction | neighborhood | food_cafe | logistics",
  "region": "string — bairro ou zona (ex: Centro, Boa Viagem)",
  "summary": "string — 1-2 frases factuais sobre o lugar (min 10 chars)",
  "content": "string — 3-6 frases detalhando o lugar (min 30 chars)",
  "tags": ["string", "..."] (3 a 6 palavras-chave),
  "source": "manual",
  "updatedAt": "2026-03-29"
}

Categorias:
- attraction: museus, parques, igrejas, monumentos, praias, pontos turísticos
- neighborhood: bairros com caráter turístico ou cultural
- food_cafe: restaurantes, cafés, bares, mercados gastronômicos, cervejarias
- logistics: aeroportos, estações, terminais, aluguel de carro, serviços essenciais

Regras de qualidade:
- Não invente endereços, horários de funcionamento ou valores de entrada como fatos absolutos
- Use apenas conhecimento público verificável
- O campo "id" deve usar apenas ASCII sem acentos (ex: "salvador-attraction-elevador-lacerda")
- Todos os 10 campos são obrigatórios
- "summary" e "content" podem estar em português com acentos

Lugares para gerar:
[LISTA DE LUGARES SEPARADOS POR VÍRGULA]
```

---

## Exemplo de saída esperada

```json
[
  {
    "id": "salvador-attraction-elevador-lacerda",
    "city": "Salvador",
    "title": "Elevador Lacerda",
    "category": "attraction",
    "region": "Centro Histórico",
    "summary": "Cartão postal de Salvador, o Elevador Lacerda liga a Cidade Alta à Cidade Baixa desde 1873.",
    "content": "O Elevador Lacerda é um dos símbolos mais reconhecidos de Salvador. Inaugurado em 1873 como elevador hidráulico e modernizado ao longo dos anos, ele realiza cerca de 30 mil viagens por dia. Oferece uma vista privilegiada da Baía de Todos os Santos durante o percurso de 72 metros de altura. Localizado na Praça Municipal, próximo ao Pelourinho, é ponto de partida para explorar o centro histórico tombado pela UNESCO.",
    "tags": ["elevador", "cidade alta", "cidade baixa", "baía", "centro histórico"],
    "source": "manual",
    "updatedAt": "2026-03-29"
  },
  {
    "id": "salvador-food-cafe-casa-de-tereza",
    "city": "Salvador",
    "title": "Casa de Tereza",
    "category": "food_cafe",
    "region": "Itaigara",
    "summary": "Restaurante de alta gastronomia baiana comandado pela chef Tereza Paim, referência na culinária nordestina contemporânea.",
    "content": "A Casa de Tereza é considerada um dos melhores restaurantes da Bahia, com foco em ingredientes locais e técnicas modernas aplicadas à tradição baiana. A chef Tereza Paim reinterpreta clássicos como moqueca e vatapá com precisão gastronômica. O ambiente é acolhedor, situado em um casarão no bairro Itaigara. Indicado para jantares especiais e degustação de gastronomia baiana de autor.",
    "tags": ["gastronomia baiana", "chef", "moqueca", "alta culinária", "itaigara"],
    "source": "manual",
    "updatedAt": "2026-03-29"
  }
]
```

---

## Convenção de IDs

| Formato | Exemplo |
|---|---|
| `<cidade>-attraction-<slug>` | `recife-attraction-paco-do-frevo` |
| `<cidade>-neighborhood-<slug>` | `recife-neighborhood-boa-viagem` |
| `<cidade>-food-cafe-<slug>` | `recife-food-cafe-burburinho` |
| `<cidade>-logistics-<slug>` | `recife-logistics-aeroporto-guararapes` |

- Sempre minúsculo
- Sem acentos, cedilha ou espaços (use `-`)
- Slug derivado do nome do lugar

---

## Dicas para listas de lugares longas

Se você tiver mais de 15 lugares, divida em lotes de 10 para evitar timeouts ou respostas truncadas:

```
# Lote 1
Elevador Lacerda, Pelourinho, Igreja de São Francisco, Forte de Santo Antônio, Mercado Modelo

# Lote 2
Praia do Porto da Barra, Farol da Barra, MAM Bahia, Casa do Rio Vermelho, Jardim dos Namorados
```

Cada lote gera um array separado. Cole ambos no app — ele aceita múltiplas importações.
