const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("DataBountyCore Protocol", function () {
  const initialFeeBps = 250; // 2.50%
  const prodId1 = ethers.encodeBytes32String("climate-grid");
  const prodId2 = ethers.encodeBytes32String("market-depth");
  const price1 = ethers.parseEther("0.001"); // 0.001 BOT per credit
  const price2 = ethers.parseEther("0.0005");
  const metadata1 = "ipfs://QmClimateGridSignalsV1";

  async function deployCoreFixture() {
    const [owner, provider1, provider2, buyer1, buyer2, feeRecipient] = await ethers.getSigners();
    const DataBountyCore = await ethers.getContractFactory("DataBountyCore");
    const core = await DataBountyCore.deploy(initialFeeBps);
    await core.waitForDeployment();
    return { core, owner, provider1, provider2, buyer1, buyer2, feeRecipient };
  }

  async function registeredProductFixture() {
    const fixture = await deployCoreFixture();
    await fixture.core.connect(fixture.provider1).registerProduct(prodId1, price1, metadata1);
    return fixture;
  }

  async function purchasedCreditsFixture() {
    const fixture = await registeredProductFixture();
    const quantity = 100n;
    const totalCost = quantity * price1;
    await fixture.core.connect(fixture.buyer1).purchaseCredits(prodId1, quantity, { value: totalCost });
    return { ...fixture, quantity, totalCost };
  }

  describe("Deployment & Configuration", function () {
    it("Should set owner correctly and initialize fee", async function () {
      const { core, owner } = await loadFixture(deployCoreFixture);
      expect(await core.owner()).to.equal(owner.address);
      expect(await core.feeBps()).to.equal(initialFeeBps);
      expect(await core.MAX_FEE_BPS()).to.equal(1000);
    });

    it("Should reject fee exceeding MAX_FEE_BPS in constructor", async function () {
      const DataBountyCore = await ethers.getContractFactory("DataBountyCore");
      await expect(DataBountyCore.deploy(1001)).to.be.revertedWithCustomError(
        DataBountyCore,
        "InvalidFee"
      );
    });

    it("Owner can update marketplace fee within limits", async function () {
      const { core, owner } = await loadFixture(deployCoreFixture);
      await expect(core.connect(owner).setMarketplaceFee(500))
        .to.emit(core, "MarketplaceFeeUpdated")
        .withArgs(250, 500);
      expect(await core.feeBps()).to.equal(500);
    });

    it("Non-owner cannot update marketplace fee", async function () {
      const { core, buyer1 } = await loadFixture(deployCoreFixture);
      await expect(
        core.connect(buyer1).setMarketplaceFee(300)
      ).to.be.revertedWithCustomError(core, "Unauthorized");
    });

    it("Cannot set fee higher than MAX_FEE_BPS", async function () {
      const { core, owner } = await loadFixture(deployCoreFixture);
      await expect(
        core.connect(owner).setMarketplaceFee(1001)
      ).to.be.revertedWithCustomError(core, "InvalidFee");
    });
  });

  describe("Product Management", function () {
    it("Provider can register a product", async function () {
      const { core, provider1 } = await loadFixture(deployCoreFixture);
      const tx = await core.connect(provider1).registerProduct(prodId1, price1, metadata1);
      const receipt = await tx.wait();
      console.log("      Gas used for registerProduct:", receipt.gasUsed.toString());

      await expect(tx)
        .to.emit(core, "ProductRegistered")
        .withArgs(prodId1, provider1.address, price1, metadata1);

      const prod = await core.getProduct(prodId1);
      expect(prod.provider).to.equal(provider1.address);
      expect(prod.active).to.be.true;
      expect(prod.pricePerCredit).to.equal(price1);
      expect(prod.metadataURI).to.equal(metadata1);
    });

    it("Cannot register with empty product ID", async function () {
      const { core, provider1 } = await loadFixture(deployCoreFixture);
      await expect(
        core.connect(provider1).registerProduct(ethers.ZeroHash, price1, metadata1)
      ).to.be.revertedWithCustomError(core, "InvalidProduct");
    });

    it("Cannot register zero price", async function () {
      const { core, provider1 } = await loadFixture(deployCoreFixture);
      await expect(
        core.connect(provider1).registerProduct(prodId1, 0, metadata1)
      ).to.be.revertedWithCustomError(core, "InvalidPrice");
    });

    it("Cannot register duplicate product ID", async function () {
      const { core, provider1, provider2 } = await loadFixture(registeredProductFixture);
      await expect(
        core.connect(provider2).registerProduct(prodId1, price2, "ipfs://other")
      ).to.be.revertedWithCustomError(core, "ProductAlreadyExists");
    });

    it("Provider can update product status", async function () {
      const { core, provider1 } = await loadFixture(registeredProductFixture);
      await expect(core.connect(provider1).setProductStatus(prodId1, false))
        .to.emit(core, "ProductStatusUpdated")
        .withArgs(prodId1, false);

      const prod = await core.getProduct(prodId1);
      expect(prod.active).to.be.false;
    });

    it("Non-provider cannot update product status", async function () {
      const { core, buyer1 } = await loadFixture(registeredProductFixture);
      await expect(
        core.connect(buyer1).setProductStatus(prodId1, false)
      ).to.be.revertedWithCustomError(core, "Unauthorized");
    });

    it("Provider can update price", async function () {
      const { core, provider1 } = await loadFixture(registeredProductFixture);
      const newPrice = ethers.parseEther("0.002");
      await expect(core.connect(provider1).setProductPrice(prodId1, newPrice))
        .to.emit(core, "ProductPriceUpdated")
        .withArgs(prodId1, newPrice);

      const prod = await core.getProduct(prodId1);
      expect(prod.pricePerCredit).to.equal(newPrice);
    });

    it("Cannot update price to zero", async function () {
      const { core, provider1 } = await loadFixture(registeredProductFixture);
      await expect(
        core.connect(provider1).setProductPrice(prodId1, 0)
      ).to.be.revertedWithCustomError(core, "InvalidPrice");
    });
  });

  describe("Credit Purchases", function () {
    it("Buyer can purchase credits with exact native payment", async function () {
      const { core, buyer1 } = await loadFixture(registeredProductFixture);
      const quantity = 100n;
      const totalCost = quantity * price1;

      const tx = await core.connect(buyer1).purchaseCredits(prodId1, quantity, { value: totalCost });
      const receipt = await tx.wait();
      console.log("      Gas used for purchaseCredits:", receipt.gasUsed.toString());

      await expect(tx)
        .to.emit(core, "CreditsPurchased")
        .withArgs(prodId1, buyer1.address, quantity, totalCost);

      expect(await core.getCredits(prodId1, buyer1.address)).to.equal(quantity);
    });

    it("Reverts if product does not exist", async function () {
      const { core, buyer1 } = await loadFixture(deployCoreFixture);
      const nonExistent = ethers.encodeBytes32String("non-existent");
      await expect(
        core.connect(buyer1).purchaseCredits(nonExistent, 10, { value: ethers.parseEther("0.01") })
      ).to.be.revertedWithCustomError(core, "InvalidProduct");
    });

    it("Reverts if product is inactive", async function () {
      const { core, provider1, buyer1 } = await loadFixture(registeredProductFixture);
      await core.connect(provider1).setProductStatus(prodId1, false);
      await expect(
        core.connect(buyer1).purchaseCredits(prodId1, 10, { value: 10n * price1 })
      ).to.be.revertedWithCustomError(core, "ProductInactive");
    });

    it("Reverts if quantity is 0", async function () {
      const { core, buyer1 } = await loadFixture(registeredProductFixture);
      await expect(
        core.connect(buyer1).purchaseCredits(prodId1, 0, { value: 0 })
      ).to.be.revertedWithCustomError(core, "InvalidQuantity");
    });

    it("Reverts on incorrect payment (underpayment or overpayment)", async function () {
      const { core, buyer1 } = await loadFixture(registeredProductFixture);
      const quantity = 10n;
      const exactCost = quantity * price1;

      // Underpayment
      await expect(
        core.connect(buyer1).purchaseCredits(prodId1, quantity, { value: exactCost - 1n })
      ).to.be.revertedWithCustomError(core, "IncorrectPayment");

      // Overpayment
      await expect(
        core.connect(buyer1).purchaseCredits(prodId1, quantity, { value: exactCost + 1000n })
      ).to.be.revertedWithCustomError(core, "IncorrectPayment");
    });
  });

  describe("Usage Settlement", function () {
    const receiptHash1 = ethers.keccak256(ethers.toUtf8Bytes("receipt-001-nonce-12345"));
    const receiptHash2 = ethers.keccak256(ethers.toUtf8Bytes("receipt-002-nonce-67890"));

    it("Buyer can settle valid usage receipt", async function () {
      const { core, buyer1, provider1, quantity } = await loadFixture(purchasedCreditsFixture);
      const settleQty = 25n;
      const gross = settleQty * price1;
      const expectedFee = (gross * BigInt(initialFeeBps)) / 10000n;
      const expectedProvider = gross - expectedFee;

      const tx = await core.connect(buyer1).settleUsage(prodId1, settleQty, receiptHash1);
      const receipt = await tx.wait();
      console.log("      Gas used for settleUsage:", receipt.gasUsed.toString());

      await expect(tx)
        .to.emit(core, "UsageSettled")
        .withArgs(prodId1, buyer1.address, provider1.address, settleQty, receiptHash1, expectedProvider, expectedFee);

      expect(await core.getCredits(prodId1, buyer1.address)).to.equal(quantity - settleQty);
      expect(await core.getProviderBalance(provider1.address)).to.equal(expectedProvider);
      expect(await core.accruedMarketplaceFees()).to.equal(expectedFee);
      expect(await core.isReceiptSettled(receiptHash1)).to.be.true;
    });

    it("Prevents replay of same receipt hash", async function () {
      const { core, buyer1 } = await loadFixture(purchasedCreditsFixture);
      await core.connect(buyer1).settleUsage(prodId1, 10n, receiptHash1);
      await expect(
        core.connect(buyer1).settleUsage(prodId1, 10n, receiptHash1)
      ).to.be.revertedWithCustomError(core, "ReceiptAlreadySettled");
    });

    it("Reverts if credits are insufficient", async function () {
      const { core, buyer1 } = await loadFixture(purchasedCreditsFixture);
      await expect(
        core.connect(buyer1).settleUsage(prodId1, 150n, receiptHash1)
      ).to.be.revertedWithCustomError(core, "InsufficientCredits");
    });

    it("Reverts if quantity is zero", async function () {
      const { core, buyer1 } = await loadFixture(purchasedCreditsFixture);
      await expect(
        core.connect(buyer1).settleUsage(prodId1, 0n, receiptHash1)
      ).to.be.revertedWithCustomError(core, "InvalidQuantity");
    });

    it("Reverts if receipt hash is empty", async function () {
      const { core, buyer1 } = await loadFixture(purchasedCreditsFixture);
      await expect(
        core.connect(buyer1).settleUsage(prodId1, 10n, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(core, "InvalidReceipt");
    });

    it("Fair Policy: Previously purchased credits can still be settled after product deactivation", async function () {
      const { core, provider1, buyer1 } = await loadFixture(purchasedCreditsFixture);
      await core.connect(provider1).setProductStatus(prodId1, false);

      await expect(
        core.connect(buyer1).settleUsage(prodId1, 20n, receiptHash2)
      ).to.emit(core, "UsageSettled");

      expect(await core.getCredits(prodId1, buyer1.address)).to.equal(80n);
    });
  });

  describe("Withdrawals (Pull Payments)", function () {
    async function settledFixture() {
      const fixture = await purchasedCreditsFixture();
      const receiptHash = ethers.keccak256(ethers.toUtf8Bytes("receipt-withdraw-fixture"));
      await fixture.core.connect(fixture.buyer1).settleUsage(prodId1, 100n, receiptHash);
      return fixture;
    }

    it("Provider can withdraw accrued settlement proceeds", async function () {
      const { core, provider1 } = await loadFixture(settledFixture);
      const claimable = await core.getProviderBalance(provider1.address);
      expect(claimable).to.be.gt(0);

      const balanceBefore = await ethers.provider.getBalance(provider1.address);

      const tx = await core.connect(provider1).withdrawProviderProceeds();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      console.log("      Gas used for withdrawProviderProceeds:", receipt.gasUsed.toString());

      await expect(tx)
        .to.emit(core, "ProviderWithdrawal")
        .withArgs(provider1.address, claimable);

      const balanceAfter = await ethers.provider.getBalance(provider1.address);
      expect(balanceAfter).to.equal(balanceBefore + claimable - gasCost);
      expect(await core.getProviderBalance(provider1.address)).to.equal(0);
    });

    it("Provider cannot withdraw twice (reverts NothingToWithdraw)", async function () {
      const { core, provider1 } = await loadFixture(settledFixture);
      await core.connect(provider1).withdrawProviderProceeds();
      await expect(
        core.connect(provider1).withdrawProviderProceeds()
      ).to.be.revertedWithCustomError(core, "NothingToWithdraw");
    });

    it("Owner can withdraw accrued marketplace fees", async function () {
      const { core, owner, feeRecipient } = await loadFixture(settledFixture);
      const feeAmount = await core.accruedMarketplaceFees();
      expect(feeAmount).to.be.gt(0);

      const balanceBefore = await ethers.provider.getBalance(feeRecipient.address);

      const tx = await core.connect(owner).withdrawMarketplaceFees(feeRecipient.address);
      const receipt = await tx.wait();
      console.log("      Gas used for withdrawMarketplaceFees:", receipt.gasUsed.toString());

      await expect(tx)
        .to.emit(core, "MarketplaceFeeWithdrawal")
        .withArgs(feeRecipient.address, feeAmount);

      const balanceAfter = await ethers.provider.getBalance(feeRecipient.address);
      expect(balanceAfter).to.equal(balanceBefore + feeAmount);
      expect(await core.accruedMarketplaceFees()).to.equal(0);
    });

    it("Non-owner cannot withdraw marketplace fees", async function () {
      const { core, buyer1 } = await loadFixture(settledFixture);
      await expect(
        core.connect(buyer1).withdrawMarketplaceFees(buyer1.address)
      ).to.be.revertedWithCustomError(core, "Unauthorized");
    });
  });
});
