import { Duration, Stack, type StackProps, Tags } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";

export interface ObservabilityStackProps extends StackProps {
  clusterName: string;
  webServiceName: string;
  workerServiceName: string;
  albFullName: string;
  dbInstanceId: string;
  redisClusterId: string;
  alarmEmail: string | undefined;
}

/**
 * Baseline alarms — prd.md §14.4, §15. Deliberately simple (5xx rate,
 * CPU, DB storage): enough to know something's wrong, not a full
 * dashboard. The admin AI/cost dashboards (tasks/todo/m12) are a
 * separate, app-level concern — this stack is infra health only.
 */
export class ObservabilityStack extends Stack {
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    this.alarmTopic = new sns.Topic(this, "AlarmTopic", {
      topicName: "resume-pilot-alarms",
    });
    if (props.alarmEmail) {
      this.alarmTopic.addSubscription(new snsSubscriptions.EmailSubscription(props.alarmEmail));
    }

    const alarmAction = new cloudwatchActions.SnsAction(this.alarmTopic);

    const alb5xxRate = new cloudwatch.Alarm(this, "Alb5xxAlarm", {
      alarmDescription: "ALB returning elevated 5xx responses",
      metric: new cloudwatch.Metric({
        namespace: "AWS/ApplicationELB",
        metricName: "HTTPCode_Target_5XX_Count",
        dimensionsMap: { LoadBalancer: props.albFullName },
        statistic: "Sum",
        period: Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alb5xxRate.addAlarmAction(alarmAction);

    const serviceCpuAlarm = (id: string, serviceName: string) => {
      const alarm = new cloudwatch.Alarm(this, id, {
        alarmDescription: `${serviceName} CPU utilization high`,
        metric: new cloudwatch.Metric({
          namespace: "AWS/ECS",
          metricName: "CPUUtilization",
          dimensionsMap: { ClusterName: props.clusterName, ServiceName: serviceName },
          statistic: "Average",
          period: Duration.minutes(5),
        }),
        threshold: 85,
        evaluationPeriods: 3,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(alarmAction);
      return alarm;
    };
    serviceCpuAlarm("WebCpuAlarm", props.webServiceName);
    serviceCpuAlarm("WorkerCpuAlarm", props.workerServiceName);

    const dbCpuAlarm = new cloudwatch.Alarm(this, "DbCpuAlarm", {
      alarmDescription: "RDS CPU utilization high",
      metric: new cloudwatch.Metric({
        namespace: "AWS/RDS",
        metricName: "CPUUtilization",
        dimensionsMap: { DBInstanceIdentifier: props.dbInstanceId },
        statistic: "Average",
        period: Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dbCpuAlarm.addAlarmAction(alarmAction);

    const dbStorageAlarm = new cloudwatch.Alarm(this, "DbFreeStorageAlarm", {
      alarmDescription: "RDS free storage space low",
      metric: new cloudwatch.Metric({
        namespace: "AWS/RDS",
        metricName: "FreeStorageSpace",
        dimensionsMap: { DBInstanceIdentifier: props.dbInstanceId },
        statistic: "Minimum",
        period: Duration.minutes(5),
      }),
      threshold: 2 * 1024 * 1024 * 1024, // 2 GiB
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dbStorageAlarm.addAlarmAction(alarmAction);

    const cacheCpuAlarm = new cloudwatch.Alarm(this, "CacheCpuAlarm", {
      alarmDescription: "ElastiCache CPU utilization high",
      metric: new cloudwatch.Metric({
        namespace: "AWS/ElastiCache",
        metricName: "EngineCPUUtilization",
        dimensionsMap: { CacheClusterId: props.redisClusterId },
        statistic: "Average",
        period: Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    cacheCpuAlarm.addAlarmAction(alarmAction);

    Tags.of(this).add("Project", "resume-pilot");
  }
}
