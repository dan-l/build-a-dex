const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DlimToken", function () {
  let Token;
  let dlimToken;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    Token = await ethers.getContractFactory("DlimToken");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    dlimToken = await Token.deploy();
  });

  describe("Deployment ", async function () {
    it("Should set the right name and symbol", async function () {
      expect(await dlimToken.name()).to.equal("DlimToken");
      expect(await dlimToken.symbol()).to.equal("DLIM");
      expect(await dlimToken.balanceOf(owner.getAddress())).to.equal(0);
      expect(await dlimToken.balanceOf(addr1.getAddress())).to.equal(0);
    });
  });

  describe("Minting ", async function () {
    it("Should allow admin to mint", async function () {
      await dlimToken._mint(10);
      expect(await dlimToken.balanceOf(owner.getAddress())).to.equal(10);
    });

    it("Should not allow non-admin to mint", async function () {
      await expect(dlimToken.connect(addr1)._mint(10)).to.be.reverted;
    });

    it("Should be able to disable mint", async function () {
      await dlimToken._disable_mint();
      await expect(dlimToken._mint(10)).to.be.reverted;
      expect(await dlimToken.balanceOf(owner.getAddress())).to.equal(0);
    });
  });

});
