import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"; 

const REGION = process.env.AWS_VPC_REGION;
const s3 = new S3Client({ region: REGION });
const sns = new SNSClient({ region: REGION });
const dynamoDB = new DynamoDBClient({ region: REGION });

const SNS_TOPIC_ARN = process.env.AWS_SNS_TOPIC_ARN;
const DYNAMODB_TABLE_NAME = process.env.AWS_DYNAMODB_TABLE_NAME;
const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
const BUCKET_PREFIX = process.env.AWS_BUCKET_PREFIX;

export const handler = async (event) => {
  try {
    const { filename, contentType, email } = JSON.parse(event.body);
    const fileKey = `${BUCKET_PREFIX}/${filename}`;

    // Generate pre-signed URL
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fileKey,
      ContentType: contentType,
    };
    const command = new PutObjectCommand(uploadParams);
    
    const uploadURL = await getSignedUrl(s3, command, { expiresIn: 60 });
    
    // Save data to DynamoDB
    const timestamp = new Date().toISOString();
    const item = {
      email: { S: email },
      url: { S: `https://${BUCKET_NAME}.s3.amazonaws.com/${fileKey}` },
      datetime: { S: timestamp },
    };

    await dynamoDB.send(new PutItemCommand({
      TableName: DYNAMODB_TABLE_NAME,
      Item: item,
    }));

    // Send SNS notification
    const snsMessage = `A new file named ${filename} was uploaded by ${email}.`;
    await sns.send(new PublishCommand({
      Message: snsMessage,
      TopicArn: SNS_TOPIC_ARN,
    }));

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ uploadURL }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
