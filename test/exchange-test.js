const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Exchange", function () {
  let exchange;
  let token;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function() {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    let tokenContract = await ethers.getContractFactory("DlimToken");
    token = await tokenContract.deploy();
    // setup the owner balance to be 1000 token
    const ownerTokens = 1000;
    const tokensToTranfer = 200;
    token._mint(ownerTokens+tokensToTranfer);
    token.transfer(addr1.getAddress(), tokensToTranfer);

    let exhangeContract = await ethers.getContractFactory("TokenExchange");
    exchange = await exhangeContract.deploy(token.address);
    token.approve(exchange.address, 1000);
    // setup a pool of 20 ETH : 10 Token
    await exchange.createPool(10, { value: 20 });
  });

  describe("Deployment", function() {
    it("Should have the right initial state", async function () {
      expect(await exchange.token_reserves()).to.equal(10);
      expect(await exchange.eth_reserves()).to.equal(20);
      expect(await exchange.admin()).to.equal(await owner.getAddress());
      expect(await exchange.balanceOfPool(owner.getAddress())).to.equal(20);
    });

    it("Should have the right prices", async function() {
      const tokenPrice = await exchange.priceToken();
      expect(tokenPrice).to.equal(2);

      const ethPrice = await exchange.priceETH();
      expect(ethPrice).to.equal(0);
    });
  });

   describe("Liquidity", function() {
    it("Should be able to add liquidity", async function() {
      // min token 1, max 2, actual 1 
      await exchange.addLiquidity(1, 2, { value: 2 });
      // 20 (pool) + 2 (liquidity)
      expect(await exchange.eth_reserves()).to.equal(22);
      // 2 eth: 1 token = 10(pool) + 1(liquidity)
      expect(await exchange.token_reserves()).to.equal(11);
      expect(await exchange.k()).to.equal(22*11);
      expect(await exchange.balanceOfPool(owner.getAddress())).to.equal(22);
      // 1000 - 10 (pool) - 1 (liquidity)
      expect(await token.balanceOf(owner.getAddress())).to.equal(989);
    });

    it("Should supply more than 0 eth to add liquidity", async function() {
      // min token 1, max 2, actual 1 
      await expect(exchange.addLiquidity(1, 2, { value: 0 })).to.be.reverted;
    });

    it("Should not be able to add liquidity with insufficient balance", async function() {
      // min token 1, max 2, actual 1 
      await expect(exchange.addLiquidity(1, 2, { value: 2000 })).to.be.reverted;
    });

    it("Should be able to remove liquidity they provided", async function () {
      // min token 5, max 15, actual 10
      await exchange.removeLiquidity(20, 5, 15);
      expect(await exchange.eth_reserves()).to.equal(0);
      expect(await exchange.token_reserves()).to.equal(0);
      expect(await exchange.k()).to.equal(0);
      expect(await exchange.balanceOfPool(owner.getAddress())).to.equal(0);
      expect(await token.balanceOf(owner.getAddress())).to.equal(1000);
    });

    it("Should be able to add then remove liquidity", async function () {
      // min token 1, max 2, actual 1
      await exchange.addLiquidity(1, 2, { value: 2 });
      // min token 5, max 15, actual 11
      await exchange.removeLiquidity(22, 5, 15);
      expect(await exchange.eth_reserves()).to.equal(0);
      expect(await exchange.token_reserves()).to.equal(0);
      expect(await exchange.k()).to.equal(0);
      expect(await exchange.balanceOfPool(owner.getAddress())).to.equal(0);
      expect(await token.balanceOf(owner.getAddress())).to.equal(1000);
    });

    it("Should not be able to remove liquidity more than they provided", async function () {
      // someone else provided liquidity
      token.connect(addr1).approve(exchange.address, 20);
      // min token 10, max 20, actual 10
      await exchange.connect(addr1).addLiquidity(10, 20, { value: 20 });
      // min token 5, max 15, actual 15
      await expect(exchange.removeLiquidity(30, 5, 15)).to.be.reverted;
      expect(await token.balanceOf(owner.getAddress())).to.equal(990);
    });

    it("Should be able to remove all liquidity", async function () {
      // add in more liquidity
      // min token 1, max 2, actual 1
      await exchange.addLiquidity(1, 2, { value: 2 });
      // remove some liquidity
      // min token 1, max 5, actual 1
      await exchange.removeLiquidity(2, 1, 5);
      expect(await exchange.eth_reserves()).to.equal(20);
      expect(await exchange.token_reserves()).to.equal(10);
      expect(await exchange.k()).to.equal(10*20);
      expect(await exchange.balanceOfPool(owner.getAddress())).to.equal(20);
      expect(await token.balanceOf(owner.getAddress())).to.equal(990);
      // remove all liquidity
      await exchange.removeAllLiquidity();
      expect(await exchange.eth_reserves()).to.equal(0);
      expect(await exchange.token_reserves()).to.equal(0);
      expect(await exchange.k()).to.equal(0);
      expect(await exchange.balanceOfPool(owner.getAddress())).to.equal(0);
      expect(await token.balanceOf(owner.getAddress())).to.equal(1000);
    });
   });

   describe("Swapping", async function() {
    it("Should be able to swap tokens for ETH", async function () {
      // based on rate, 2 tokens for 1 eth
      await exchange.swapTokensForETH(2, 1);
      expect(await exchange.eth_reserves()).to.equal(19);
      expect(await exchange.token_reserves()).to.equal(12);
      expect(await token.balanceOf(owner.getAddress())).to.equal(988);
      expect(await token.balanceOf(exchange.address)).to.equal(12);
    });

    it("Should be able to swap ETH for tokens", async function () {
       // based on rate, 2 tokens for 1 eth
      await exchange.swapETHForTokens(4, { value: 2 });
      expect(await exchange.eth_reserves()).to.equal(22);
      expect(await exchange.token_reserves()).to.equal(6);
      expect(await token.balanceOf(owner.getAddress())).to.equal(994);
      expect(await token.balanceOf(exchange.address)).to.equal(6);
    });

    it("Should not be able to swap if insufficient balance", async function () {
      await expect(exchange.swapTokensForETH(10000, 5000)).to.be.reverted;
      await expect(exchange.swapETHForTokens(200, { value: 100})).to.be.reverted;
    });

    it ("Should not be able to swap if it will exhaust supply", async function () {
      await expect(exchange.swapTokensForETH(40, 20)).to.be.reverted;
      await expect(exchange.swapETHForTokens(10, { value: 5})).to.be.reverted;
    });

    it("Shoult not be able to swap if it exceeded slippage", async function() {
      await expect(exchange.swapTokensForETH(2, 5)).to.be.reverted;
      await expect(exchange.swapETHForTokens(10, { value: 2})).to.be.reverted;
    });
   });

});
