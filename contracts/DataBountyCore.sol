// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title DataBountyCore
 * @notice Production-grade, gas-optimized onchain data marketplace & usage-billing primitive.
 *         Deployed on BOT Chain Mainnet (Chain ID 677).
 *
 * Architecture:
 * - Single-contract core protocol using native BOT for zero-overhead, direct settlement.
 * - Minimal storage slot footprint (packed Product struct with 20-byte address and 1-byte bool).
 * - Pull-payment pattern with reentrancy protection for all fund withdrawals.
 * - Deterministic receipt replay protection using canonical receipt hashes.
 * - Hard-capped marketplace fee structure (max 10.00%, default 2.50%).
 */
contract DataBountyCore {
    // ------------------------------------------------------------------------
    // Custom Errors (Gas-optimized, cheaper than revert strings)
    // ------------------------------------------------------------------------
    error Unauthorized();
    error InvalidProduct();
    error ProductAlreadyExists();
    error ProductInactive();
    error InvalidQuantity();
    error InvalidPrice();
    error InvalidFee();
    error IncorrectPayment(uint256 expected, uint256 received);
    error InsufficientCredits(uint256 available, uint256 required);
    error ReceiptAlreadySettled(bytes32 receiptHash);
    error InvalidReceipt();
    error NothingToWithdraw();
    error TransferFailed();
    error ReentrancyGuardLocked();

    // ------------------------------------------------------------------------
    // Packed Storage Structures
    // ------------------------------------------------------------------------
    struct Product {
        address provider;       // 20 bytes | slot 0
        bool active;            //  1 byte  | slot 0 (11 bytes unused)
        uint256 pricePerCredit; // 32 bytes | slot 1 (price in wei of native BOT per credit)
        string metadataURI;     // Dynamic  | slot 2 (IPFS/Arweave/canonical metadata URI)
    }

    // ------------------------------------------------------------------------
    // Protocol State
    // ------------------------------------------------------------------------
    /// @notice Protocol administrator address (immutable, saves SLOAD gas)
    address public immutable owner;

    /// @notice Maximum protocol fee limit: 1000 basis points = 10.00%
    uint16 public constant MAX_FEE_BPS = 1000;

    /// @notice Current protocol fee in basis points (e.g. 250 = 2.50%)
    uint16 public feeBps;

    /// @notice Reentrancy lock (1 = unlocked, 2 = locked)
    uint8 private _locked;

    /// @dev Product catalog mapping: productId => Product
    mapping(bytes32 => Product) private _products;

    /// @dev Prepaid usage credit balances: productId => buyer => credits
    mapping(bytes32 => mapping(address => uint256)) private _creditBalances;

    /// @dev Settlement replay prevention: receiptHash => settled status
    mapping(bytes32 => bool) public settledReceipts;

    /// @dev Claimable proceeds for data providers: provider address => accrued BOT wei
    mapping(address => uint256) public providerBalances;

    /// @dev Accrued marketplace platform fees in BOT wei
    uint256 public accruedMarketplaceFees;

    // ------------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------------
    event ProductRegistered(
        bytes32 indexed productId,
        address indexed provider,
        uint256 pricePerCredit,
        string metadataURI
    );

    event ProductStatusUpdated(bytes32 indexed productId, bool active);
    event ProductPriceUpdated(bytes32 indexed productId, uint256 newPrice);
    event MarketplaceFeeUpdated(uint16 oldFeeBps, uint16 newFeeBps);

    event CreditsPurchased(
        bytes32 indexed productId,
        address indexed buyer,
        uint256 quantity,
        uint256 totalCost
    );

    event UsageSettled(
        bytes32 indexed productId,
        address indexed buyer,
        address provider,
        uint256 quantity,
        bytes32 indexed receiptHash,
        uint256 providerAmount,
        uint256 feeAmount
    );

    event ProviderWithdrawal(address indexed provider, uint256 amount);
    event MarketplaceFeeWithdrawal(address indexed recipient, uint256 amount);

    // ------------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------------
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (_locked == 2) revert ReentrancyGuardLocked();
        _locked = 2;
        _;
        _locked = 1;
    }

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------
    constructor(uint16 initialFeeBps) {
        if (initialFeeBps > MAX_FEE_BPS) revert InvalidFee();
        owner = msg.sender;
        feeBps = initialFeeBps;
        _locked = 1;
    }

    // ------------------------------------------------------------------------
    // Product Management
    // ------------------------------------------------------------------------

    /**
     * @notice Registers a new data product or API feed with commercial terms.
     * @param productId Unique 32-byte identifier for the product.
     * @param pricePerCredit Cost in wei of native BOT per credit.
     * @param metadataURI Offchain URI or content hash pointing to dataset schema/documentation.
     */
    function registerProduct(
        bytes32 productId,
        uint256 pricePerCredit,
        string calldata metadataURI
    ) external {
        if (productId == bytes32(0)) revert InvalidProduct();
        if (_products[productId].provider != address(0)) revert ProductAlreadyExists();
        if (pricePerCredit == 0) revert InvalidPrice();

        _products[productId] = Product({
            provider: msg.sender,
            active: true,
            pricePerCredit: pricePerCredit,
            metadataURI: metadataURI
        });

        emit ProductRegistered(productId, msg.sender, pricePerCredit, metadataURI);
    }

    /**
     * @notice Updates the active status of a registered data product.
     * @param productId Product identifier.
     * @param active New active state.
     */
    function setProductStatus(bytes32 productId, bool active) external {
        Product storage product = _products[productId];
        if (product.provider != msg.sender) revert Unauthorized();
        product.active = active;
        emit ProductStatusUpdated(productId, active);
    }

    /**
     * @notice Updates the price per credit for future credit purchases.
     * @param productId Product identifier.
     * @param newPrice New price per credit in BOT wei.
     */
    function setProductPrice(bytes32 productId, uint256 newPrice) external {
        Product storage product = _products[productId];
        if (product.provider != msg.sender) revert Unauthorized();
        if (newPrice == 0) revert InvalidPrice();
        product.pricePerCredit = newPrice;
        emit ProductPriceUpdated(productId, newPrice);
    }

    /**
     * @notice Updates protocol marketplace fee (restricted to protocol owner, capped at 10%).
     * @param newFeeBps Fee in basis points (1 = 0.01%, 1000 = 10.00%).
     */
    function setMarketplaceFee(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert InvalidFee();
        uint16 old = feeBps;
        feeBps = newFeeBps;
        emit MarketplaceFeeUpdated(old, newFeeBps);
    }

    // ------------------------------------------------------------------------
    // Credit Purchase
    // ------------------------------------------------------------------------

    /**
     * @notice Purchases prepaid usage credits for an active data product using native BOT.
     * @param productId Target product identifier.
     * @param quantity Number of credits to purchase.
     */
    function purchaseCredits(bytes32 productId, uint256 quantity) external payable {
        Product storage product = _products[productId];
        if (product.provider == address(0)) revert InvalidProduct();
        if (!product.active) revert ProductInactive();
        if (quantity == 0) revert InvalidQuantity();

        uint256 totalCost = quantity * product.pricePerCredit;
        if (msg.value != totalCost) revert IncorrectPayment(totalCost, msg.value);

        _creditBalances[productId][msg.sender] += quantity;

        emit CreditsPurchased(productId, msg.sender, quantity, totalCost);
    }

    // ------------------------------------------------------------------------
    // Usage Settlement
    // ------------------------------------------------------------------------

    /**
     * @notice Submits a canonical usage receipt and settles payment to the data provider.
     *         The caller must be the buyer whose prepaid credits are consumed.
     *         Fair policy: Even if a product is deactivated for new purchases, previously
     *         bought credits can still be settled to honor buyer usage.
     * @param productId Product identifier.
     * @param quantity Number of credits to consume.
     * @param receiptHash Cryptographic keccak256 hash of the canonical offchain receipt.
     */
    function settleUsage(
        bytes32 productId,
        uint256 quantity,
        bytes32 receiptHash
    ) external {
        if (receiptHash == bytes32(0)) revert InvalidReceipt();
        if (settledReceipts[receiptHash]) revert ReceiptAlreadySettled(receiptHash);
        if (quantity == 0) revert InvalidQuantity();

        Product storage product = _products[productId];
        if (product.provider == address(0)) revert InvalidProduct();

        uint256 available = _creditBalances[productId][msg.sender];
        if (available < quantity) revert InsufficientCredits(available, quantity);

        // State updates before external interactions
        settledReceipts[receiptHash] = true;
        _creditBalances[productId][msg.sender] = available - quantity;

        uint256 grossAmount = quantity * product.pricePerCredit;
        uint256 feeAmount = (grossAmount * feeBps) / 10000;
        uint256 providerAmount = grossAmount - feeAmount;

        providerBalances[product.provider] += providerAmount;
        accruedMarketplaceFees += feeAmount;

        emit UsageSettled(
            productId,
            msg.sender,
            product.provider,
            quantity,
            receiptHash,
            providerAmount,
            feeAmount
        );
    }

    // ------------------------------------------------------------------------
    // Withdrawals (Pull Payment Pattern)
    // ------------------------------------------------------------------------

    /**
     * @notice Allows data providers to withdraw their accumulated settlement proceeds.
     */
    function withdrawProviderProceeds() external nonReentrant {
        uint256 amount = providerBalances[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        providerBalances[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit ProviderWithdrawal(msg.sender, amount);
    }

    /**
     * @notice Allows protocol owner to withdraw accrued marketplace fees.
     * @param recipient Destination address for the fees.
     */
    function withdrawMarketplaceFees(address payable recipient) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert Unauthorized();
        uint256 amount = accruedMarketplaceFees;
        if (amount == 0) revert NothingToWithdraw();

        accruedMarketplaceFees = 0;

        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit MarketplaceFeeWithdrawal(recipient, amount);
    }

    // ------------------------------------------------------------------------
    // Read-only Queries
    // ------------------------------------------------------------------------

    /**
     * @notice Returns product configuration.
     */
    function getProduct(bytes32 productId)
        external
        view
        returns (
            address provider,
            bool active,
            uint256 pricePerCredit,
            string memory metadataURI
        )
    {
        Product storage p = _products[productId];
        if (p.provider == address(0)) revert InvalidProduct();
        return (p.provider, p.active, p.pricePerCredit, p.metadataURI);
    }

    /**
     * @notice Returns buyer's available prepaid credit balance for a product.
     */
    function getCredits(bytes32 productId, address buyer) external view returns (uint256) {
        return _creditBalances[productId][buyer];
    }

    /**
     * @notice Returns claimable proceeds for a provider.
     */
    function getProviderBalance(address provider) external view returns (uint256) {
        return providerBalances[provider];
    }

    /**
     * @notice Returns whether a receipt hash has already been settled.
     */
    function isReceiptSettled(bytes32 receiptHash) external view returns (bool) {
        return settledReceipts[receiptHash];
    }
}
