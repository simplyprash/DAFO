import { ethers } from 'ethers';

export const build = ({ role, style }) => {
  const customInputRole = ethers.BigNumber.from(mapRole(role));
  const customInputStyle = mapStyle(style);
  const palette = ethers.BigNumber.from(customInputStyle.palette);
  const outline = customInputStyle.outline;
  return { palette, outline, role: customInputRole };
};

const mapRole = (role) => {
  switch (role) {
    case 'Academic':
      return 0;
    case 'Activist':
      return 1;
    case 'Artist':
      return 2;
    case 'Business':
      return 3;
    default: 
      throw new Error(`invalid role ${role}`);
  }
};

const mapStyle = (style) => {
  switch (style) {
    case 'greenFillBlackBG':
      return { palette: 0, outline: false };
    case 'blackFillWhiteBG':
      return { palette: 1, outline: false };
    case 'blackFillGreenBG':
      return { palette: 2, outline: false };
    case 'greenOutlineBlackBG':
      return { palette: 0, outline: true };
    case 'blackOutlineWhiteBG':
      return { palette: 1, outline: true };
    case 'blackOutlineGreenBG':
      return { palette: 2, outline: true };
    default:
      throw new Error(`invalid style ${style}`);
  }
};
