const ainUtil = require("@ainblockchain/ain-util");

const getTransactionHash = (transaction) => {
  return "0x" + ainUtil.hashTransaction(transaction).toString("hex");
};

const getAddress = (hash, signature, chainId) => {
  const sigBuffer = ainUtil.toBuffer(signature);
  const len = sigBuffer.length;
  const lenHash = len - 65;
  const { r, s, v } = ainUtil.ecSplitSig(sigBuffer.slice(lenHash, len));
  const publicKey = ainUtil.ecRecoverPub(
    Buffer.from(hash.slice(2), "hex"),
    r,
    s,
    v,
    chainId
  );
  return ainUtil.toChecksumAddress(
    ainUtil.bufferToHex(
      ainUtil.pubToAddress(publicKey, publicKey.length === 65)
    )
  );
};

const verifySignature = (tx, sig, addr, chainId) => {
  return ainUtil.ecVerifySig(tx, sig, addr, chainId);
};

const getMessage = (transaction) => {
  // case: type is SET_VALUE
  if (transaction.value) {
    return value.message;
  }

  // case: type is SET
  const { op_list } = transaction;
  let message = "";
  for (const op of op_list) {
    const { ref, value } = op;
    if (ref.includes("message")) {
      message = value;
      break;
    }
  }
  return message;
};

const getRef = (transactionData) => {
  const { operation, type } = transactionData;
  switch (type) {
    case "SET_VALUE":
      return operation.ref;
    case "SET":
      const { op_list } = operation;
      return op_list[0].ref.split('/').slice(0, -1).join('/');
    default:
      return null;
  }
}


module.exports = {
  getTransactionHash,
  getAddress,
  verifySignature,
  getMessage,
  getRef,
};
