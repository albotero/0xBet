// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.17;

/* Dependencies */
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

error Erc20Bet__IsNotOwner();
error Erc20Bet__MaxSupplyReached();
error Erc20Bet__CoolDownTimeNotPassed();

/**@title BET Token
 * @author Alejandro Botero
 * @notice BET token serves as in-app currency for all games and gambles
 * @dev ERC20 implementation
 */
contract Erc20Bet is IERC20, ERC20Burnable {
    /* State variables */

    address private immutable i_owner;
    uint256 private immutable i_decimals;
    uint256 private immutable i_maxSupply;
    uint256 private s_mintedTokens;

    // This is a map of addresses to cooldown times and is triggered on every transfer.
    mapping(address => uint32) private s_cooldowns;
    // Some addresses should never have a cooldown, such as exchange addresses. Those can be added here.
    mapping(address => bool) private s_cooldownWhitelist;

    // *GregoryUnderscore - 4/19/22
    // Force a "sell cooldown" after a buy or transfer.
    // By forcing a cooldown, sandwich attacks become much harder because they
    // cannot immediately take profit. This greatly decreases the likelihood of attacks.
    // Adjust the cooldown as needed. However, do not make it changeable as that would
    // be a grave security issue.
    uint constant MEV_COOLDOWN_TIME = 3 minutes;

    /* Events */
    event Erc20Bet__TokensMinted(address indexed _address, uint256 indexed _amount);

    /* Modifiers */

    modifier OnlyOwner() {
        if (msg.sender != i_owner) revert Erc20Bet__IsNotOwner();
        _;
    }

    /* Functions */
    constructor(uint256 _maxSupply, uint256 _decimals) ERC20("0xBet", "BET") {
        i_owner = msg.sender;
        i_decimals = _decimals;
        i_maxSupply = _maxSupply;
    }

    /**
     * @dev Hook that is called before any transfer of tokens. This includes
     * minting and burning.
     *
     * Calling conditions:
     *
     * - when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
     * will be transferred to `to`.
     * - when `from` is zero, `amount` tokens will be minted for `to`.
     * - when `to` is zero, `amount` of ``from``'s tokens will be burned.
     * - `from` and `to` are never both zero.
     *
     * To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].
     */
    function _beforeTokenTransfer(address from, address /*to*/, uint256 /*amount*/) internal virtual override {
        // *GregoryUnderscore - 4/19/22
        // If the from address is not in the cooldown whitelist, verify it is not in the cooldown
        // period. If it is, prevent the transfer.
        if (s_cooldownWhitelist[from] != true) {
            // Change the error message according to the customized cooldown time.
            if (s_cooldowns[from] > uint32(block.timestamp)) revert Erc20Bet__CoolDownTimeNotPassed();
        }
    }

    /**
     * @dev Hook that is called after any transfer of tokens. This includes
     * minting and burning.
     *
     * Calling conditions:
     *
     * - when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
     * has been transferred to `to`.
     * - when `from` is zero, `amount` tokens have been minted for `to`.
     * - when `to` is zero, `amount` of ``from``'s tokens have been burned.
     * - `from` and `to` are never both zero.
     *
     * To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].
     */
    function _afterTokenTransfer(address /*from*/, address to, uint256 /*amount*/) internal virtual override {
        // *GregoryUnderscore - 4/19/22
        // If the to address is not in the cooldown whitelist, add a cooldown to it.
        if (s_cooldownWhitelist[to] != true) {
            // Add a cooldown to the address receiving the tokens.
            s_cooldowns[to] = uint32(block.timestamp + MEV_COOLDOWN_TIME);
        }
    }

    /**
     * *GregoryUnderscore - 4/19/22
     * Pass in an address to add it to the cooldown whitelist.
     */
    function addCooldownWhitelist(address whitelistAddy) public OnlyOwner {
        s_cooldownWhitelist[whitelistAddy] = true;
    }

    /**
     * *GregoryUnderscore - 4/19/22
     * Pass in an address to remove it from the cooldown whitelist.
     */
    function removeCooldownWhitelist(address whitelistAddy) public OnlyOwner {
        s_cooldownWhitelist[whitelistAddy] = false;
    }

    function mintTokens(address _address, uint256 _amount) external OnlyOwner {
        if (_amount + s_mintedTokens > i_maxSupply) revert Erc20Bet__MaxSupplyReached();
        _mint(_address, _amount);
        s_mintedTokens += _amount;
        emit Erc20Bet__TokensMinted(_address, _amount);
    }

    function burnTokens(uint256 _amount) external {
        _burn(msg.sender, _amount);
    }

    function getMaxSupply() external view returns (uint256) {
        return i_maxSupply;
    }

    function decimals() public view override returns (uint8) {
        return uint8(i_decimals);
    }
}
