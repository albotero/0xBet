// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

library BitOps {
    function setBitAtIndex(uint256 _data, uint256 index) external pure returns (uint256) {
        return (1 << index) | _data;
    }

    function unsetBitAtIndex(uint256 _data, uint256 index) external pure returns (uint256) {
        return ~(1 << index) & _data;
    }

    function setBitsAtIndexBase1To0(uint64 _data, uint256 indexes) external pure returns (uint64) {
        while (indexes > 0) {
            uint256 index = indexes & 0xFF;
            _data = uint64(1 << (53 - index)) | _data;
            indexes >>= 8;
        }
        return _data;
    }

    function unSetBitsAtIndex(uint64 _data, uint256[] memory index) external pure returns (uint64) {
        for (uint256 i = 0; i < index.length; i++) _data = ~uint64(1 << index[i]) & _data;
        return _data;
    }

    function getBitCount(uint256 _data) external pure returns (uint256 count) {
        for (count = 0; _data > 0; count++) _data &= _data - 1;
    }

    function getBitPositions(uint64 _data) external pure returns (uint8[7] memory bitPositions) {
        uint256 count;
        for (uint8 index = 64; index > 0; ) {
            index--;
            uint256 mask = 1 << index;
            if (_data & mask > 0) {
                bitPositions[count] = index;
                count++;
            }
            // Avoid overflow bitPositions array
            if (count == 7) break;
        }
    }

    function getNibbles(uint64 _data) external pure returns (uint8[16] memory nibbles) {
        for (uint8 i = 16; i > 0; ) {
            i--;
            nibbles[i] = uint8(_data & 0x0F);
            _data >>= 4;
        }
    }

    function appendNumberToData(uint256 _data, uint8 _number) external pure returns (uint256) {
        return (_data << 8) | _number;
    }
}
