require('dotenv').config();
const ethers = require('ethers');
const { NonfungiblePositionManager, UniswapV3Pool } = require('@uniswap/v3-periphery');
const { ChainId, Token, WETH, Trade, Route, Percent } = require('@uniswap/sdk');

const alchemyRpcUrl = process.env.ALCHEMY_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;

const provider = new ethers.providers.JsonRpcProvider(alchemyRpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);

const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

async function initiateFlashSwap(tokenA, tokenB) {
  const uniswapV3PoolAddress = UniswapV3Pool.getAddress(tokenA, tokenB, 3000); // fee is set to 3000

  const uniswapV3Pool = new UniswapV3Pool(uniswapV3PoolAddress, provider);
  const [tickLower, tickUpper] = await uniswapV3Pool.getTicks();

  const nonfungiblePositionManager = new NonfungiblePositionManager(
    provider,
    wallet,
    ChainId.MAINNET
  );

  const [position] = await nonfungiblePositionManager.positions({
    token0: tokenA,
    token1: tokenB,
    lower: tickLower,
    upper: tickUpper,
  });

  const amount0 = await calculateAmountAfterSwap(uniswapV3Pool, position.liquidity, tokenA, tokenB);
  const amount1 = await calculateAmountAfterSwap(uniswapV3Pool, position.liquidity, tokenB, tokenA);

  const tokenIn = amount0.gt(amount1) ? tokenA : tokenB;
  const tokenOut = amount0.gt(amount1) ? tokenB : tokenA;
  const amountIn = amount0.gt(amount1) ? amount0 : amount1;
  const amountOutMinimum = amount0.gt(amount1) ? amount1 : amount0;

  // Perform the flash swap

  // Transfer profits to your desired wallet or contract
  const profitToken = amount0.gt(amount1) ? tokenB : tokenA;
  const profitAmount = amount0.gt(amount1) ? amount1 : amount0;

  console.log(`Profit: ${ethers.utils.formatUnits(profitAmount, 18)} ${profitToken}`);
}

async function calculateAmountAfterSwap(pool, liquidity, tokenIn, tokenOut) {
  const tokenA = new Token(ChainId.MAINNET, tokenIn, 18, 'Token A', 'Token A');
  const tokenB = new Token(ChainId.MAINNET, tokenOut, 18, 'Token B', 'Token B');

  const route = new Route([pool], tokenA, tokenB);
  const trade = new Trade(route, new TokenAmount(tokenA, liquidity), TradeType.EXACT_INPUT);

  return trade.executionPrice.toSignificant(6); // Adjust the precision as needed
}

initiateFlashSwap(DAI_ADDRESS, USDC_ADDRESS)
  .then(() => {
    console.log('Flash swap completed successfully');
  })
  .catch((error) => {
    console.error('Flash swap error:', error);
  });
