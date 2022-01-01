// =================== CS251 DEX Project =================== // 
//        @authors: Simon Tao '22, Mathew Hogan '22          //
// ========================================================= //    
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../interfaces/erc20_interface.sol';
import '../libraries/safe_math.sol';
import './token.sol';


contract TokenExchange {
    using SafeMath for uint;
    address public admin;

    DlimToken private token;

    // Liquidity pool for the exchange
    uint public token_reserves = 0;
    uint public eth_reserves = 0;
    // Total supply of LP tokens
    uint private totalSupply = 0;
    // Each address percentage of the liquidity pool
    mapping (address => uint) private lpPool;

    // Constant: x * y = k
    uint public k;
    
    // liquidity rewards
    uint private swap_fee_numerator = 0;       // TODO Part 5: Set liquidity providers' returns.
    uint private swap_fee_denominator = 100;
    
    event AddLiquidity(address from, uint amount);
    event RemoveLiquidity(address to, uint amount);
    event Received(address from, uint amountETH);

    constructor(address tokenAddr) 
    {
        admin = msg.sender;
        token = DlimToken(tokenAddr);
    }
    
    modifier AdminOnly {
        require(msg.sender == admin, "Only admin can use this function!");
        _;
    }    

    // Used for receiving ETH
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
    fallback() external payable{}

    // Function createPool: Initializes a liquidity pool between your Token and ETH.
    // ETH will be sent to pool in this transaction as msg.value
    // amountTokens specifies the amount of tokens to transfer from the liquidity provider.
    // Sets up the initial exchange rate for the pool by setting amount of token and amount of ETH.
    function createPool(uint amountTokens)
        external
        payable
        AdminOnly
    {
        // require pool does not yet exist
        require (token_reserves == 0, "Token reserves was not 0");
        require (eth_reserves == 0, "ETH reserves was not 0.");

        // require nonzero values were sent
        require (msg.value > 0, "Need ETH to create pool.");
        require (amountTokens > 0, "Need tokens to create pool.");

        token.transferFrom(msg.sender, address(this), amountTokens);
        updateLiquidityInfo(msg.value, msg.value);
        updateReserveRatio(msg.value, amountTokens);
    }

    // ============================================================
    //                    FUNCTIONS TO IMPLEMENT
    // ============================================================
    /* Be sure to use the SafeMath library for all operations! */
    
    // Function priceToken: Calculate the price of your token in ETH.
    // You can change the inputs, or the scope of your function, as needed.
    function priceToken()
        public
        view
        returns (uint)
    {
        // we want ETH price, so ETH reserve / token reserve
        (, uint price) = eth_reserves.tryDiv(token_reserves);
        return price;
    }

    // Function priceETH: Calculate the price of ETH for your token.
    // You can change the inputs, or the scope of your function, as needed.
    function priceETH()
        public
        view
        returns (uint)
    {
        (, uint price) = token_reserves.tryDiv(eth_reserves);
        return price;
    }


    /* ========================= Liquidity Provider Functions =========================  */ 

    // Function addLiquidity: Adds liquidity given a supply of ETH (sent to the contract as msg.value)
    // You can change the inputs, or the scope of your function, as needed.
    function addLiquidity() 
        external 
        payable
    {
        uint ethSupplied = msg.value;
        // Calculate the liquidity to be added based on what was sent in and the prices.
        uint tokenSupplied = ethSupplied.mul(token_reserves).div(eth_reserves);
        require(tokenSupplied > 0, 'token supplied less than 0');
        // If the caller possesses insufficient tokens to equal the ETH sent, then transaction must fail.
        require(token.balanceOf(msg.sender) >= tokenSupplied, 'Not enough balance to transfer token');
        token.transferFrom(msg.sender, address(this), tokenSupplied);
        // Mint LP tokens
        uint amountMinted = totalSupply.mul(ethSupplied).div(eth_reserves);
        updateLiquidityInfo(totalSupply.add(amountMinted), lpPool[msg.sender].add(amountMinted));
        // Update token_reserves, eth_reserves, and k.
        updateReserveRatio(eth_reserves.add(ethSupplied), token_reserves.add(tokenSupplied));
        // Emit AddLiquidity event.
        emit AddLiquidity(msg.sender, ethSupplied);
    }


    // Function removeLiquidity: Removes liquidity given the desired amount of ETH to remove.
    // You can change the inputs, or the scope of your function, as needed.
    function removeLiquidity(uint amountETH)
        public 
        payable
    {
      // Withdrawn at the current exchange rate (reserve ratio), not the ratio of their originial investment
      // This means some value can be lost from market fluctuations and arbitrage
      uint amountBurned = totalSupply.mul(amountETH).div(eth_reserves);
      // Calculate the proportional share of eth and tokens from the pool
      uint ethWithdrawn = eth_reserves.mul(amountBurned).div(totalSupply);
      uint tokensWithdrawn = token_reserves.mul(amountBurned).div(totalSupply);
      // If the caller possesses insufficient tokens to equal the ETH sent, then transaction must fail.
      require(token.balanceOf(address(this)) >= tokensWithdrawn, 'Not enough liquidity to withdraw token');
      require(address(this).balance >= ethWithdrawn, 'Not enough liquidity to withdraw ETH');
      token.transfer(msg.sender, tokensWithdrawn);
      payable(msg.sender).transfer(ethWithdrawn);
      // Burn LP tokens
      updateLiquidityInfo(totalSupply.sub(amountBurned), lpPool[msg.sender].sub(amountBurned));
      // Update token_reserves, eth_reserves, and k.
      updateReserveRatio(eth_reserves.sub(ethWithdrawn), token_reserves.sub(tokensWithdrawn));
      // Emit RemoveLiquidity event.
      emit RemoveLiquidity(msg.sender, amountETH);
    }

    // Function removeAllLiquidity: Removes all liquidity that msg.sender is entitled to withdraw
    // You can change the inputs, or the scope of your function, as needed.
    function removeAllLiquidity()
        external
        payable
    {
        /******* TODO: Implement this function *******/
        /* HINTS:
            Decide on the maximum allowable ETH that msg.sender can remove.
            Call removeLiquidity().
        */
    }

    /***  Define helper functions for liquidity management here as needed: ***/
    function balanceOfPool(address account)
      external
      view
      returns (uint)
    {
      return lpPool[account];
    }

    function updateReserveRatio(uint ethAmt, uint tokenAmt) private
    {
      token_reserves = tokenAmt;
      eth_reserves = ethAmt;
      k = eth_reserves.mul(token_reserves);
    }

    function updateLiquidityInfo(uint newSupply, uint amountMinted) private
    {
      totalSupply = newSupply;
      lpPool[msg.sender] = amountMinted;
    }

    /* ========================= Swap Functions =========================  */ 

    // Function swapTokensForETH: Swaps your token with ETH
    // You can change the inputs, or the scope of your function, as needed.
    function swapTokensForETH(uint amountTokens)
        external 
        payable
    {
        /******* TODO: Implement this function *******/
        /* HINTS:
            Calculate amount of ETH should be swapped based on exchange rate.
            Transfer the ETH to the provider.
            If the caller possesses insufficient tokens, transaction must fail.
            If performing the swap would exhaus total ETH supply, transaction must fail.
            Update token_reserves and eth_reserves.

            Part 4: 
                Expand the function to take in addition parameters as needed.
                If current exchange_rate > slippage limit, abort the swap.
            
            Part 5:
                Only exchange amountTokens * (1 - liquidity_percent), 
                    where % is sent to liquidity providers.
                Keep track of the liquidity fees to be added.
        */


        /***************************/
        // DO NOT MODIFY BELOW THIS LINE
        /* Check for x * y == k, assuming x and y are rounded to the nearest integer. */
        // Check for Math.abs(token_reserves * eth_reserves - k) < (token_reserves + eth_reserves + 1));
        //   to account for the small decimal errors during uint division rounding.
        uint check = token_reserves.mul(eth_reserves);
        if (check >= k) {
            check = check.sub(k);
        }
        else {
            check = k.sub(check);
        }
        assert(check < (token_reserves.add(eth_reserves).add(1)));
    }



    // Function swapETHForTokens: Swaps ETH for your tokens.
    // ETH is sent to contract as msg.value.
    // You can change the inputs, or the scope of your function, as needed.
    function swapETHForTokens()
        external
        payable 
    {
        /******* TODO: Implement this function *******/
        /* HINTS:
            Calculate amount of your tokens should be swapped based on exchange rate.
            Transfer the amount of your tokens to the provider.
            If performing the swap would exhaus total token supply, transaction must fail.
            Update token_reserves and eth_reserves.

            Part 4: 
                Expand the function to take in addition parameters as needed.
                If current exchange_rate > slippage limit, abort the swap. 
            
            Part 5: 
                Only exchange amountTokens * (1 - %liquidity), 
                    where % is sent to liquidity providers.
                Keep track of the liquidity fees to be added.
        */


        /**************************/
        // DO NOT MODIFY BELOW THIS LINE
        /* Check for x * y == k, assuming x and y are rounded to the nearest integer. */
        // Check for Math.abs(token_reserves * eth_reserves - k) < (token_reserves + eth_reserves + 1));
        //   to account for the small decimal errors during uint division rounding.
        uint check = token_reserves.mul(eth_reserves);
        if (check >= k) {
            check = check.sub(k);
        }
        else {
            check = k.sub(check);
        }
        assert(check < (token_reserves.add(eth_reserves).add(1)));
    }

    /***  Define helper functions for swaps here as needed: ***/

}
