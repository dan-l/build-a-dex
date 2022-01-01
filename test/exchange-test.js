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
    token._mint(1000);

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
      await exchange.addLiquidity({ value: 2 });
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
      await expect(exchange.addLiquidity({ value: 0 })).to.be.reverted;
    });

    it("Should not be able to add liquidity with insufficient balance", async function() {
      await expect(exchange.addLiquidity({ value: 2000 })).to.be.reverted;
    });
   });

});
