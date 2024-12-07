'use client';

import {
  ConnectWallet,
  Wallet,
  WalletContextType,
  WalletDropdown,
  WalletDropdownLink,
  WalletDropdownDisconnect,
} from '@coinbase/onchainkit/wallet';
import {
  Address,
  Avatar,
  Name,
  Identity,
  EthBalance,
  getAddress,
} from '@coinbase/onchainkit/identity';
import ArrowSvg from './svg/ArrowSvg';
import ImageSvg from './svg/Image';
import OnchainkitSvg from './svg/OnchainKit';
import { border, pressable, text as dsText, color, cn } from '@coinbase/onchainkit/theme';
import { Transaction, TransactionButton, TransactionSponsor, TransactionToast, TransactionToastAction, TransactionToastIcon, TransactionToastLabel } from '@coinbase/onchainkit/transaction';
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { addEnsContracts, ensPublicActions } from '@ensdomains/ensjs'
import { getAddressRecord } from '@ensdomains/ensjs/public'
import { Dispatch, FC, SetStateAction, useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { AddressLike } from 'ethers';
import FormWizard from "react-form-wizard-component";
import "react-form-wizard-component/dist/style.css";
import { address } from 'framer-motion/client';
import { useAccount } from 'wagmi';
import OpenAI from 'openai';

const openAi = new OpenAI({
  dangerouslyAllowBrowser: true,
  apiKey:  ''
  // process.env.OPENAI_API_KEY, //TODO
})


// Remove these imports
// import { useWizard, Wizard } from 'react-use-wizard';
// import { AnimatePresence } from 'framer-motion';

const clientWithEns = createPublicClient({
  chain: addEnsContracts(mainnet),
  transport: http(),
}).extend(ensPublicActions)

type Question = {
  id: number;
  text: string;
  options: string[];
}

const questions: Question[] = [
  {
    id: 1,
    text: "What is your preferred blockchain?",
    options: ["Ethereum", "Base", "Optimism", "Polygon"]
  },
  {
    id: 2,
    text: "What type of dApp are you building?",
    options: ["DeFi", "NFT", "DAO", "Other"]
  },
  // Add more questions as needed
];

const PageComponent: FC<{
  question: Question;
  onNext: (answer: string) => void;
  onPrevious: () => void;
  isLastStep: boolean;
}> = ({ question, onNext, onPrevious, isLastStep }) => {
  return (
    <div className="flex flex-col items-center p-6 space-y-4">
      <h2 className="text-2xl font-bold">{question.text}</h2>
      <div className="flex flex-col space-y-2">
        {question.options.map((option) => (
          <button
            key={option}
            className="px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => onNext(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="flex justify-between w-full pt-4">
        <button 
          onClick={onPrevious}
          className="px-4 py-2 border rounded-lg"
        >
          Previous
        </button>
        {!isLastStep && (
          <button 
            onClick={() => onNext('')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
};

type CustomWizardProps = {
  setSubmitted: (isSubmitted: boolean) => void;
  setAnswers: Dispatch<SetStateAction<Record<number, string>>>
};

const CustomWizard: FC<CustomWizardProps> = ({
  setSubmitted,
  setAnswers,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = (answer: string) => {
    setAnswers(prev => ({...prev, [currentStep]: answer}));
    if (currentStep < questions.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      // console.log('Final answers:', answers);
      setSubmitted(true);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h1 className="text-2xl font-bold text-center p-4 mb-6">Let&apos;s do a questionnaire!
      </h1>
      <PageComponent 
        question={questions[currentStep]}
        onNext={handleNext}
        onPrevious={handlePrevious}
        isLastStep={currentStep === questions.length - 1}
      />
      <div className="mt-4 text-center text-sm text-gray-500">
        Step {currentStep + 1} of {questions.length}
      </div>
    </div>
  );
};

export default function App() {
  const [calls, setCalls] = useState<Array<{to: string, data: string, value: bigint}>>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const { address: accountAddress } = useAccount()
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [suggestedNames, setSuggestedNames] = useState<string[]>([]);
  const [preferredName, setPreferredName] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const removeAlreadyRegisteredNames = useCallback(async (names: string[]) => {
    if (!names.length) {
      return
    }

    const data = names.map((name) => {
      return getAddressRecord.batch({ name })
    })

    const ensAddresses = await clientWithEns.ensBatch(
      ...data
    )

  }, [])


  useEffect(() => {
    if (answers[4]) {
      getSuggestedNames()
    }
  }, [answers])

  const getSuggestedNames = async () => {
    const questionAndAnswers = questions.map((question) => {
      return `question: ${question.text}. Answer: ${answers[question.id -1]}` //zero indexed
    })

    if (!questionAndAnswers.length || questionAndAnswers.length > 2) { //TODO change to 5 
      return
    }

    const chatCompletion = await openAi.chat.completions.create({
      messages: [
        { role: 'system', content: `You should return 5 names in the format name.base.eth based on the questions and answers by the user. 
          The input is in the format "question: Question goes here. Answer: Answer goes here".
          Response format should be "name1.base.eth, name2.base.eth, name3.base.eth, name4.base.eth, name5.base.eth"
          ` },
        { role: 'user', content: questionAndAnswers.join('\n') },
      ],
      "model": "gpt-4o-mini",
    });

    const suggestedNames = chatCompletion?.choices[0].message?.content?.split(',').map((name: string) => name.trim())
    console.log('suggestedNames', suggestedNames)
    if (suggestedNames) {
      setSuggestedNames(suggestedNames)
    }

    // setTimeout(() => {
    //   setSuggestedNames(['test', 'te5st2', 'test3'])
    // }
    // , 2000)

  }

  const getCalldata = useCallback(async (name: string, address?: AddressLike) => {
    // const ensAddresses = await clientWithEns.getAddressRecord({ name })
    // if (ensAddresses) {
    //   throw new Error('Name already registered')
    // }
    if (!address) {
      return
    }

    const contract = new ethers.Contract(
      ethers.ZeroAddress,
       [
        'function register((string name, address owner, uint256 duration, address resolver, bytes[] data, bool reverseRecord))',
        'function setAddr(bytes32,address)',
        'function setName(bytes32,string)',
       ]
      );

      // const nodeHash = '0x895daf7b3a29592dffe98b8a50f843d712aaa34afc05d4f061a46da6f784bf14'
      const rootNode = '0xff1e3c0eb00ec714e34b6114125fbde1dea2f24a72fbf672e7b7fd5690328e10'
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes(name))
      const nodeHash = ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [rootNode, nameHash])
      // const nodeHash = ethers.namehash(`${name}.${rootNode}`)


      const data = contract.interface.encodeFunctionData('register', [{
        name: name,
        owner: address,
        duration: 31537000,
        resolver: '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD', 
        data: [
          contract.interface.encodeFunctionData('setAddr', [nodeHash, address]),
          contract.interface.encodeFunctionData('setName', [nodeHash, name]),
        ],
        reverseRecord: false,
      }
      ])

      console.log('data', data)

      return data
  }, [])

  useEffect(() => {
    const calldataMethod = async () => {
      const calldata = await getCalldata(preferredName, accountAddress)
      setCalls([{ 
        to: '0x4cCb0BB02FCABA27e82a56646E81d8c5bC4119a5',  // ens registry address
        data: calldata,
        value: ethers.parseEther('0.001')
      }])
    }

    calldataMethod()
  }, [preferredName, getCalldata, accountAddress])

  return (
    <div className="min-h-screen bg-white dark:bg-background">
      <header className="p-4">
        <div className="flex justify-end">
          <Wallet>
            <ConnectWallet>
              <Avatar className="h-6 w-6" />
              <Name />
            </ConnectWallet>
          </Wallet>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!accountAddress && (
          <div className="flex justify-center">
            <h1 className="text-2xl font-bold text-center p-4 mb-6">Connect your wallet </h1>
          </div>
        )}
        {!isSubmitted && accountAddress && (
          <CustomWizard 
            setSubmitted={setIsSubmitted}
            setAnswers={setAnswers}
            />
        )}

        {isSubmitted && (
          <div className="mt-8">
            <h1 className="text-2xl font-bold text-center p-4 mb-6">Your Pick? </h1>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
            {
            suggestedNames.map((name) => (
              <button
                key={name}
                onClick={() => setPreferredName(name)}
                className={`
                  p-4 rounded-lg transition-all duration-200
                  ${preferredName === name 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700'
                  }
                `}
            >
              {name}
            </button>
              ))
            }
            </div>


            
          </div>
        )}
        
        {preferredName && preferredName != '' && (
                  <div className="mt-8">
                  <Transaction
                    capabilities={{ 
                      paymasterService: { 
                        url: 'https://api.developer.coinbase.com/rpc/v1/base/QTiVvqiGi1npdMJig25XpUz0AGCcIXYz', 
                    },
                    }} 
                    calls={calls}
                    onStatus={s => {console.log('status', s)}}
                    onError={e => console.log('error', e)}
                  >
                    <TransactionButton />
                    <TransactionSponsor />
                    <TransactionToast>
                      <TransactionToastIcon />
                      <TransactionToastLabel />
                      <TransactionToastAction />
                    </TransactionToast>
                  </Transaction>
                </div>
        )}

      </main>
    </div>
  );
}
