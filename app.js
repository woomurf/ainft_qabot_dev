const express = require("express");
const cors = require("cors");
const fs = require("fs");
const axios = require("axios");
const Ain = require("@ainblockchain/ain-js").default;

const { getTransactionHash, getAddress, verifySignature } = require("./utils");

const queue = [];

/*
Load ENV
 */
const dataFilePath = process.env.DATA_FILE_PATH || "data.txt";
const endpoint =
  process.env.ENDPOINT || "https://eleuther-ai-gpt-j-6b-float16-text-generation-api-ainize-team.endpoint.ainize.ai";
const port = process.env.PORT || 3000;
const providerURL = process.env.PROVIDER_URL;
const ainizeInternalPrivateKey = process.env.AINIZE_INTERNAL_PRIVATE_KEY;

const generationEndPoint = `${endpoint}/predictions/text-generation`;
const healthCheckEndPoint = `${endpoint}/ping`;

let chainId = 0;
if (providerURL.includes("mainnet")) {
  chainId = 1;
} else if (providerURL.includes("dev")) {
  chainId = 2;
}

const ain = new Ain(providerURL, chainId);
const ainAddress = Ain.utils.toChecksumAddress(ain.wallet.add(ainizeInternalPrivateKey));
ain.wallet.setDefaultAccount(ainAddress);

/*
Load Data for AINFT ChatBot
 */
const data = fs.readFileSync(dataFilePath, "utf-8");

const app = express();

app.use(express.json());
app.use(cors());

app.get("/ping", async (req, res) => {
  const responseData = await axios.post(healthCheckEndPoint);
  if (responseData.status === 200) {
    res.json(responseData.data);
  } else {
    res.json({ status: "Unhealthy" });
  }
});

setInterval(async () => {
  try {
    if (queue.length === 0) return;
    const { signature, transactionData, botResponse } = queue.shift();
    const req = await ain.sendSignedTransaction(signature, transactionData, chainId);
    console.log(`Request Log: ${JSON.stringify(req)}`);
    const ref = transactionData.operation.ref;
    const responseRef = ref.concat("/response");
    const res = await ain.db.ref(responseRef).setValue({
      value: botResponse,
      nonce: -1,
    });
    console.log(`Response Log: ${JSON.stringify(res)}`);
  } catch (error) {
    console.error(`Response Log: ${JSON.stringify(error)}`);
  }
}, 1000);

/*
Postprocessing for ChatBot
 */
const processingResponse = (responseText) => {
  let retText = "";
  for (let i = 0; i < responseText.length; i++) {
    if (
      responseText[i] === "\n" ||
      responseText.substr(i, i + 7) === "Human: " ||
      responseText.substr(i, i + 4) === "AI: "
    )
      break;
    retText += responseText[i];
  }
  return retText.trim();
};

const chat = async (textInputs) => {
  console.log("TextInputs", textInputs);
  const prompt = `${data}\nHuman: ${textInputs}\nAI:`;
  try {
    const responseData = await axios.post(generationEndPoint, {
      text_inputs: prompt,
      temperature: 0,
      length: 50,
      top_p: 1,
    });
    const responseText = responseData.data[0].substr(prompt.length);
    const processedResponse = processingResponse(responseText);
    if (processedResponse.length === 0) {
      return "Oops some error occurred. Maybe there is a problem with your prompt.";
    } else {
      return processedResponse;
    }
  } catch (error) {
    return "Oops some error occurred try again";
  }
};

app.post("/chat", async (req, res) => {
  const { signature, transactionData } = req.body;
  const txHash = getTransactionHash(transactionData);
  try {
    const sigAddr = getAddress(txHash, signature, chainId);
    if (!verifySignature(transactionData, signature, sigAddr, chainId)) {
      res.status(401).json(`Invalid transaction or signature : ${JSON.stringify(req.body)}`);
      return;
    }
    if (!("operation" in transactionData)) {
      console.error(`Invalid transaction : ${JSON.stringify(transactionData)}`);
      res.status(400).json(`Invalid transaction : ${JSON.stringify(transactionData)}`);
      return;
    }
    const transaction = transactionData.operation;
    const { type: tx_type } = transaction;
    if (tx_type !== "SET_VALUE" && tx_type !== "SET") {
      console.error(`Not supported transaction type : ${tx_type}`);
      res.status(400).json(`Not supported transaction type : ${tx_type}`);
      return;
    }
    try {
      const { value } = transaction;
      console.log(value);
      const botResponse = await chat(value.message);
      queue.push({
        signature,
        transactionData,
        botResponse,
      });
      res.json({ text: botResponse });
    } catch (error) {
      console.error(`Failed : ${error}`);
      res.status(500).json(`Failed : ${error}`);
    }
  } catch (error) {
    res.status(401).json(`Invalid transaction or signature : ${error}`);
    return;
  }
});

app.listen(port, () => {
  console.log(`app listening on port ${port}`);
});
